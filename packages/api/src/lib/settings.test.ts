import { beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { mockFileSystem } from "@/testing/memory-fs";
import { createSettings } from "./settings";

const dataDir = "/data";

let disk: ReturnType<typeof mockFileSystem>;

beforeEach(() => {
  disk = mockFileSystem();
});

const configPath = () => join(dataDir, "config.yml");

test("creates the file with defaults and generated secrets when absent", async () => {
  const settings = createSettings(join(dataDir, "nested"));
  const result = await settings.read();

  expect(result.auth.username).toBe("");
  expect(result.auth.apiKey.length).toBeGreaterThan(20);

  const saved = Bun.YAML.parse(
    disk.read(join(dataDir, "nested", "config.yml")) ?? "",
  ) as { auth: { jwtSecret: string; apiKey: string } };
  expect(saved.auth.jwtSecret.length).toBeGreaterThan(20);
  expect(saved.auth.apiKey).toBe(result.auth.apiKey);
});

test("parses an existing file and keeps its values", async () => {
  disk.write(
    configPath(),
    "auth:\n  username: admin\n  passwordHash: hash\n  jwtSecret: jwt\n  apiKey: key\n",
  );
  const settings = createSettings(dataDir);

  const result = await settings.read();
  expect(result.auth).toEqual({
    username: "admin",
    passwordHash: "hash",
    jwtSecret: "jwt",
    apiKey: "key",
  });
  expect(disk.read(configPath())).toContain("jwtSecret: jwt");
});

test("fills missing secrets without touching existing values", async () => {
  disk.write(configPath(), "auth:\n  username: admin\n");
  const settings = createSettings(dataDir);

  const result = await settings.read();
  expect(result.auth.username).toBe("admin");
  expect(result.auth.apiKey.length).toBeGreaterThan(20);
  expect(disk.read(configPath())).toContain("jwtSecret");
});

test("throws a clear error on an invalid file", async () => {
  disk.write(configPath(), "auth:\n  jwtSecret: 42\n  apiKey: [\n");
  const settings = createSettings(dataDir);

  await expect(settings.read()).rejects.toThrow("YAML Parse error");
  expect(disk.read(configPath())).toContain("jwtSecret: 42");
});

test("throws on a file failing schema validation without overwriting it", async () => {
  disk.write(configPath(), "auth:\n  username: 12\n");
  const settings = createSettings(dataDir);

  await expect(settings.read()).rejects.toThrow();
  expect(disk.read(configPath())).toBe("auth:\n  username: 12\n");
});

test("saves updates atomically and keeps untouched values", async () => {
  disk.write(
    configPath(),
    "auth:\n  username: admin\n  passwordHash: hash\n  jwtSecret: jwt\n  apiKey: key\n",
  );
  const settings = createSettings(dataDir);

  const result = await settings.update({ auth: { username: "root" } });
  expect(result.auth).toEqual({
    username: "root",
    passwordHash: "hash",
    jwtSecret: "jwt",
    apiKey: "key",
  });
  expect(disk.has(`${configPath()}.tmp`)).toBe(false);

  const saved = disk.read(configPath());
  expect(saved).toContain("username: root");
  expect(saved).toContain("passwordHash: hash");
  expect(saved).toContain("jwtSecret: jwt");

  const reloaded = createSettings(dataDir);
  expect((await reloaded.read()).auth.username).toBe("root");
});

test("picks up external changes to the file", async () => {
  disk.write(configPath(), "auth:\n  username: admin\n");
  const settings = createSettings(dataDir);
  const username = async () => (await settings.read()).auth.username;
  expect(await username()).toBe("admin");

  disk.write(configPath(), "auth:\n  username: other\n");
  disk.changed(dataDir, "config.yml");
  expect(await username()).toBe("other");

  await settings.update({ auth: { username: "root" } });
  expect(await username()).toBe("root");
});

test("ignores changes to other files", async () => {
  disk.write(configPath(), "auth:\n  username: admin\n");
  const settings = createSettings(dataDir);
  expect(await (await settings.read()).auth.username).toBe("admin");

  disk.write(configPath(), "auth:\n  username: other\n");
  disk.changed(dataDir, "other.yml");
  expect((await settings.read()).auth.username).toBe("admin");
});

test("recovers once an invalid file is fixed", async () => {
  disk.write(configPath(), "auth:\n  username: 12\n");
  const settings = createSettings(dataDir);
  await expect(settings.read()).rejects.toThrow();

  disk.write(configPath(), "auth:\n  username: admin\n");
  disk.changed(dataDir, "config.yml");
  expect((await settings.read()).auth.username).toBe("admin");
});
