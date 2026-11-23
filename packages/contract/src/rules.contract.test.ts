import { expect, test } from "bun:test";
import { ActionSchema, ConditionSchema, RuleSchema } from "./rules.contract";

const rule = {
  id: 1,
  libraryId: 1,
  name: "x265",
  enabled: true,
  conditions: [{ field: "videoCodec", operator: "neq", value: "hevc" }],
  actions: [{ type: "transcodeVideo", codec: "hevc", crf: 23 }],
};

test("RuleSchema accepts a valid rule", () => {
  expect(RuleSchema.safeParse(rule).success).toBe(true);
});

test("RuleSchema requires at least one action", () => {
  expect(RuleSchema.safeParse({ ...rule, actions: [] }).success).toBe(false);
});

test("ConditionSchema rejects an unknown operator", () => {
  const condition = { field: "width", operator: "like", value: 1 };
  expect(ConditionSchema.safeParse(condition).success).toBe(false);
});

test("ActionSchema rejects an action missing its parameters", () => {
  expect(ActionSchema.safeParse({ type: "transcodeVideo" }).success).toBe(
    false,
  );
});

test("ConditionSchema requires an array for in and notIn", () => {
  const field = "audioLanguages";
  expect(
    ConditionSchema.safeParse({ field, operator: "in", value: ["eng"] })
      .success,
  ).toBe(true);
  expect(
    ConditionSchema.safeParse({ field, operator: "in", value: "eng" }).success,
  ).toBe(false);
  expect(
    ConditionSchema.safeParse({ field, operator: "notIn", value: [] }).success,
  ).toBe(false);
});

test("ConditionSchema requires a number for gt and lt", () => {
  expect(
    ConditionSchema.safeParse({ field: "width", operator: "gt", value: 1920 })
      .success,
  ).toBe(true);
  expect(
    ConditionSchema.safeParse({ field: "width", operator: "gt", value: "a" })
      .success,
  ).toBe(false);
  expect(
    ConditionSchema.safeParse({ field: "width", operator: "eq", value: [1] })
      .success,
  ).toBe(false);
});
