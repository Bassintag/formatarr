import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettings } from "./settings";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "formatarr-settings-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const configPath = () => join(dataDir, "config.yml");

test("creates the file with defaults and generated secrets when absent", async () => {
  const settings = createSettings(join(dataDir, "nested"));
  const result = await settings.read();

  expect(result.auth.username).toBe("");
  expect(result.auth.apiKey.length).toBeGreaterThan(20);

  const saved = Bun.YAML.parse(
    await Bun.file(join(dataDir, "nested", "config.yml")).text(),
  ) as { auth: { jwtSecret: string; apiKey: string } };
  expect(saved.auth.jwtSecret.length).toBeGreaterThan(20);
  expect(saved.auth.apiKey).toBe(result.auth.apiKey);
});

test("parses an existing file and keeps its values", async () => {
  await Bun.write(
    configPath(),
    "auth:\n  username: admin\n  passwordHash: hash\n  jwtSecret: jwt\n  apiKey: key\n",
  );
  const settings = createSettings(dataDir);

  const result = await settings.read();
  expect(result.auth).toEqual({ username: "admin", apiKey: "key" });
  expect(await Bun.file(configPath()).text()).toContain("jwtSecret: jwt");
});

test("fills missing secrets without touching existing values", async () => {
  await Bun.write(configPath(), "auth:\n  username: admin\n");
  const settings = createSettings(dataDir);

  const result = await settings.read();
  expect(result.auth.username).toBe("admin");
  expect(result.auth.apiKey.length).toBeGreaterThan(20);
  expect(await Bun.file(configPath()).text()).toContain("jwtSecret");
});

test("throws a clear error on an invalid file", async () => {
  await Bun.write(configPath(), "auth:\n  jwtSecret: 42\n  apiKey: [\n");
  const settings = createSettings(dataDir);

  await expect(settings.read()).rejects.toThrow("YAML Parse error");
  expect(await Bun.file(configPath()).text()).toContain("jwtSecret: 42");
});

test("throws on a file failing schema validation without overwriting it", async () => {
  await Bun.write(configPath(), "auth:\n  username: 12\n");
  const settings = createSettings(dataDir);

  await expect(settings.read()).rejects.toThrow();
  expect(await Bun.file(configPath()).text()).toBe("auth:\n  username: 12\n");
});

test("saves updates atomically and keeps untouched values", async () => {
  await Bun.write(
    configPath(),
    "auth:\n  username: admin\n  passwordHash: hash\n  jwtSecret: jwt\n  apiKey: key\n",
  );
  const settings = createSettings(dataDir);

  const result = await settings.update({ auth: { username: "root" } });
  expect(result.auth).toEqual({ username: "root", apiKey: "key" });
  expect(existsSync(`${configPath()}.tmp`)).toBe(false);

  const saved = await Bun.file(configPath()).text();
  expect(saved).toContain("username: root");
  expect(saved).toContain("passwordHash: hash");
  expect(saved).toContain("jwtSecret: jwt");

  const reloaded = createSettings(dataDir);
  expect((await reloaded.read()).auth.username).toBe("root");
});

async function eventually(read: () => Promise<string>, expected: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await read().catch(() => undefined)) === expected) return;
    await Bun.sleep(20);
  }
  expect(await read()).toBe(expected);
}

test("picks up external changes to the file", async () => {
  await Bun.write(configPath(), "auth:\n  username: admin\n");
  const settings = createSettings(dataDir);
  const username = async () => (await settings.read()).auth.username;
  expect(await username()).toBe("admin");

  await Bun.write(configPath(), "auth:\n  username: other\n");
  await eventually(username, "other");

  await settings.update({ auth: { username: "root" } });
  expect(await username()).toBe("root");
});

test("recovers once an invalid file is fixed", async () => {
  await Bun.write(configPath(), "auth:\n  username: 12\n");
  const settings = createSettings(dataDir);
  await expect(settings.read()).rejects.toThrow();

  await Bun.write(configPath(), "auth:\n  username: admin\n");
  await eventually(async () => (await settings.read()).auth.username, "admin");
});
