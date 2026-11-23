import { expect, test } from "bun:test";
import { HealthSchema } from "./health.contract";

test("HealthSchema accepts a valid payload", () => {
  expect(
    HealthSchema.safeParse({ status: "ok", time: new Date() }).success,
  ).toBe(true);
});

test("HealthSchema rejects an invalid payload", () => {
  expect(HealthSchema.safeParse({ status: "ko" }).success).toBe(false);
});
