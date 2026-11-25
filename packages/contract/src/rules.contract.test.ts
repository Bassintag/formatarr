import { expect, test } from "bun:test";
import {
  type Rule,
  type RuleCreate,
  RuleCreateSchema,
  RuleSetSchema,
} from "./rules.contract";

const rule = { libraryId: 1, enabled: true, type: "container", value: "mkv" };

test("RuleCreateSchema accepts a valid rule for every type", () => {
  const values = {
    container: "mkv",
    videoCodec: "hevc",
    maxResolution: 1080,
    maxBitrate: 8000,
    audioCodec: "aac",
    audioLanguages: ["eng", "fra"],
    subtitleLanguages: [],
  };
  for (const [type, value] of Object.entries(values)) {
    expect(RuleCreateSchema.safeParse({ ...rule, type, value }).success).toBe(
      true,
    );
  }
});

test("RuleCreateSchema rejects a value that does not match the type", () => {
  const invalid = [
    { type: "container", value: 1 },
    { type: "maxBitrate", value: "high" },
    { type: "maxResolution", value: -1 },
    { type: "audioLanguages", value: "eng" },
    { type: "subtitleLanguages", value: [1] },
  ];
  for (const item of invalid) {
    expect(RuleCreateSchema.safeParse({ ...rule, ...item }).success).toBe(
      false,
    );
  }
});

test("RuleCreateSchema rejects an unknown type", () => {
  expect(
    RuleCreateSchema.safeParse({ ...rule, type: "size", value: 1 }).success,
  ).toBe(false);
});

test("RuleSetSchema validates the value against the type", () => {
  const update = { id: 1, enabled: false, type: "audioLanguages" };
  expect(RuleSetSchema.safeParse({ ...update, value: ["eng"] }).success).toBe(
    true,
  );
  expect(RuleSetSchema.safeParse({ ...update, value: 1 }).success).toBe(false);
  expect(RuleSetSchema.safeParse({ id: 1, enabled: false }).success).toBe(
    false,
  );
});

test("Rule is assignable to RuleCreate", () => {
  const value = {} as Rule;
  const create: RuleCreate = value;
  expect(create).toBeDefined();
});
