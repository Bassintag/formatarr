import { expect, test } from "bun:test";
import { createTestCaller } from "@/testing/harness";

test("settings.get returns public settings without secrets", async () => {
  const { call } = createTestCaller();
  const result = await call.settings.get();

  expect(result.auth.apiKey.length).toBeGreaterThan(20);
  expect(result.auth).not.toHaveProperty("jwtSecret");
  expect(result.auth).not.toHaveProperty("passwordHash");
  expect(JSON.stringify(result)).not.toContain("jwtSecret");
});

test("settings.update persists changes", async () => {
  const { call } = createTestCaller();
  await call.settings.update({ auth: { username: "admin" } });

  const result = await call.settings.get();
  expect(result.auth.username).toBe("admin");
});

test("settings.update merges the job settings", async () => {
  const { call } = createTestCaller();
  await call.settings.update({ jobs: { maxRetries: 5 } });

  const result = await call.settings.get();
  expect(result.jobs).toEqual({ maxRetries: 5, timeoutSeconds: 60 });
});
