import { expect, test } from "bun:test";
import { ActionSchema, ConditionSchema, RuleSchema } from "./rules.contract";

const rule = {
  id: 1,
  libraryId: 1,
  name: "x265",
  enabled: true,
  position: 0,
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
