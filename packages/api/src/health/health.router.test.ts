import { expect, test } from "bun:test";
import { createTestCaller } from "@/testing/harness";

test("health.check reports ok with the current date", async () => {
  const { call } = createTestCaller();
  const result = await call.health.check();
  expect(result.status).toBe("ok");
  expect(result.time).toEqual(new Date());
});
