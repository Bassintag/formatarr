import { describe, expect, test } from "bun:test";
import type { MediaInfo, RuleValue } from "@formatarr/contract";
import { findUnmetRules, isRuleSatisified } from "@/rules/rule.lib";

const richMedia: MediaInfo = {
  container: "matroska",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080 },
  audio: [
    { codec: "aac", language: "eng", channels: 2 },
    { codec: "aac", language: null, channels: 6 },
  ],
  subtitles: [{ codec: "subrip", language: "fra" }],
};

const ok = (rule: RuleValue, info: MediaInfo = richMedia) =>
  isRuleSatisified(rule, info);

describe("isRuleSatisified", () => {
  test("container", () => {
    expect(ok({ type: "container", value: "matroska" })).toBe(true);
    expect(ok({ type: "container", value: "mp4" })).toBe(false);
  });

  test("videoCodec", () => {
    expect(ok({ type: "videoCodec", value: "h264" })).toBe(true);
    expect(ok({ type: "videoCodec", value: "hevc" })).toBe(false);
  });

  test("maxResolution compares the height", () => {
    expect(ok({ type: "maxResolution", value: 1080 })).toBe(true);
    expect(ok({ type: "maxResolution", value: 720 })).toBe(false);
  });

  test("maxBitrate", () => {
    expect(ok({ type: "maxBitrate", value: 5000 })).toBe(true);
    expect(ok({ type: "maxBitrate", value: 4000 })).toBe(false);
  });

  test("audioCodec requires every track to match", () => {
    expect(ok({ type: "audioCodec", value: "aac" })).toBe(true);
    expect(ok({ type: "audioCodec", value: "opus" })).toBe(false);
    const mixed = {
      ...richMedia,
      audio: [
        { codec: "aac", language: null, channels: 2 },
        { codec: "ac3", language: null, channels: 6 },
      ],
    };
    expect(ok({ type: "audioCodec", value: "aac" }, mixed)).toBe(false);
  });

  test("audioLanguages is satisfied when every tagged track is listed", () => {
    expect(ok({ type: "audioLanguages", value: ["eng", "fra"] })).toBe(true);
    expect(ok({ type: "audioLanguages", value: ["fra"] })).toBe(false);
  });

  test("untagged tracks do not break a language rule", () => {
    const untagged = {
      ...richMedia,
      audio: [{ codec: "aac", language: null, channels: 2 }],
    };
    expect(ok({ type: "audioLanguages", value: [] }, untagged)).toBe(true);
  });

  test("subtitleLanguages", () => {
    expect(ok({ type: "subtitleLanguages", value: ["fra"] })).toBe(true);
    expect(ok({ type: "subtitleLanguages", value: ["eng"] })).toBe(false);
    expect(
      ok(
        { type: "subtitleLanguages", value: [] },
        { ...richMedia, subtitles: [] },
      ),
    ).toBe(true);
  });
});

describe("findUnmetRules", () => {
  test("returns only the unmet rules", () => {
    const unmet = findUnmetRules(
      [
        { type: "container", value: "matroska" },
        { type: "maxResolution", value: 720 },
        { type: "maxBitrate", value: 1000 },
      ],
      richMedia,
    );
    expect(unmet.map((r) => r.type)).toEqual(["maxResolution", "maxBitrate"]);
  });

  test("returns nothing when every rule is satisfied", () => {
    expect(
      findUnmetRules([{ type: "container", value: "matroska" }], richMedia),
    ).toEqual([]);
  });
});
