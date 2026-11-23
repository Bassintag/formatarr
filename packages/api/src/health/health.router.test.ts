import { expect, test } from "bun:test";
import { createTestCaller } from "@/testing/harness";

test("health.check reports ok with a current date", async () => {
  const { call } = createTestCaller();
  const before = Date.now();
  const result = await call.health.check();
  expect(result.status).toBe("ok");
  expect(result.time).toBeInstanceOf(Date);
  expect(result.time.getTime()).toBeGreaterThanOrEqual(before);
});
