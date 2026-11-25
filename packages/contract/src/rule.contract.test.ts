import { expect, test } from "bun:test";
import { LibraryRuleSchema, LibraryRulesSchema } from "./rule.contract";

const rule = { enabled: true, type: "container", value: "mkv" };

test("LibraryRuleSchema accepts a valid rule for every type", () => {
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
    expect(LibraryRuleSchema.safeParse({ ...rule, type, value }).success).toBe(
      true,
    );
  }
});

test("LibraryRuleSchema rejects a value that does not match the type", () => {
  const invalid = [
    { type: "container", value: 1 },
    { type: "maxBitrate", value: "high" },
    { type: "maxResolution", value: -1 },
    { type: "audioLanguages", value: "eng" },
    { type: "subtitleLanguages", value: [1] },
  ];
  for (const item of invalid) {
    expect(LibraryRuleSchema.safeParse({ ...rule, ...item }).success).toBe(
      false,
    );
  }
});

test("LibraryRuleSchema rejects an unknown type", () => {
  expect(
    LibraryRuleSchema.safeParse({ ...rule, type: "size", value: 1 }).success,
  ).toBe(false);
});

test("LibraryRulesSchema rejects duplicate types", () => {
  const other = { enabled: true, type: "videoCodec", value: "hevc" };
  expect(LibraryRulesSchema.safeParse([rule, other]).success).toBe(true);
  expect(LibraryRulesSchema.safeParse([rule, { ...rule }]).success).toBe(false);
});
