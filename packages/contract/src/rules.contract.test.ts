import { expect, test } from "bun:test";
import {
  ActionCreateSchema,
  ConditionCreateSchema,
  type Rule,
  type RuleCreate,
  RuleCreateSchema,
} from "./rules.contract";

const rule = {
  libraryId: 1,
  name: "x265",
  enabled: true,
  conditions: [{ field: "videoCodec", operator: "neq", value: "hevc" }],
  actions: [{ type: "transcodeVideo", codec: "hevc", crf: 23 }],
};

test("RuleCreateSchema accepts a valid rule", () => {
  expect(RuleCreateSchema.safeParse(rule).success).toBe(true);
});

test("RuleCreateSchema requires at least one action", () => {
  expect(RuleCreateSchema.safeParse({ ...rule, actions: [] }).success).toBe(
    false,
  );
});

test("ConditionCreateSchema rejects an unknown operator", () => {
  const condition = { field: "width", operator: "like", value: 1 };
  expect(ConditionCreateSchema.safeParse(condition).success).toBe(false);
});

test("ActionCreateSchema rejects an action missing its parameters", () => {
  expect(ActionCreateSchema.safeParse({ type: "transcodeVideo" }).success).toBe(
    false,
  );
});

test("ConditionCreateSchema requires an array for in and notIn", () => {
  const field = "audioLanguages";
  expect(
    ConditionCreateSchema.safeParse({ field, operator: "in", value: ["eng"] })
      .success,
  ).toBe(true);
  expect(
    ConditionCreateSchema.safeParse({ field, operator: "in", value: "eng" })
      .success,
  ).toBe(false);
  expect(
    ConditionCreateSchema.safeParse({ field, operator: "notIn", value: [] })
      .success,
  ).toBe(false);
});

test("ConditionCreateSchema requires a number for gt and lt", () => {
  expect(
    ConditionCreateSchema.safeParse({
      field: "width",
      operator: "gt",
      value: 1920,
    }).success,
  ).toBe(true);
  expect(
    ConditionCreateSchema.safeParse({
      field: "width",
      operator: "gt",
      value: "a",
    }).success,
  ).toBe(false);
  expect(
    ConditionCreateSchema.safeParse({
      field: "width",
      operator: "eq",
      value: [1],
    }).success,
  ).toBe(false);
});

test("Rule is assignable to RuleCreate", () => {
  const value = {} as Rule;
  const create: RuleCreate = value;
  expect(create).toBe(value);
});
