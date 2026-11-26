import { describe, expect, test } from "bun:test";
import type { MediaInfo, RuleValue } from "@formatarr/contract";
import {
  findMismatches,
  findUnmetRules,
  isRuleSatisified,
} from "@/rules/rule.lib";

const richMedia: MediaInfo = {
  container: "mkv",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080, bitrate: 4500 },
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
    expect(ok({ type: "container", value: "mkv" })).toBe(true);
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

  test("maxBitrate compares the video bitrate", () => {
    expect(ok({ type: "maxBitrate", value: 4500 })).toBe(true);
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

  test("untagged tracks do not break a language rule", () => {
    const untagged = {
      ...richMedia,
      subtitles: [{ codec: "subrip", language: null }],
    };
    expect(ok({ type: "subtitleLanguages", value: [] }, untagged)).toBe(true);
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
        { type: "container", value: "mkv" },
        { type: "maxResolution", value: 720 },
        { type: "maxBitrate", value: 1000 },
      ],
      richMedia,
    );
    expect(unmet.map((r) => r.type)).toEqual(["maxResolution", "maxBitrate"]);
  });

  test("returns nothing when every rule is satisfied", () => {
    expect(
      findUnmetRules([{ type: "container", value: "mkv" }], richMedia),
    ).toEqual([]);
  });
});

describe("findMismatches", () => {
  const reason = (rule: RuleValue, info: MediaInfo = richMedia) =>
    findMismatches([rule], info)[0]?.reason;

  test("returns nothing when every rule is satisfied", () => {
    expect(
      findMismatches(
        [
          { type: "container", value: "mkv" },
          { type: "maxResolution", value: 1080 },
        ],
        richMedia,
      ),
    ).toEqual([]);
  });

  test("keeps the rule next to its reason", () => {
    const rule: RuleValue = { type: "container", value: "mp4" };
    expect(findMismatches([rule], richMedia)).toEqual([
      { rule, reason: "Container is mkv, expected mp4" },
    ]);
  });

  test("describes each rule type", () => {
    expect(reason({ type: "videoCodec", value: "hevc" })).toBe(
      "Video codec is h264, expected hevc",
    );
    expect(reason({ type: "maxResolution", value: 720 })).toBe(
      "Resolution 1080p exceeds max 720p",
    );
    expect(reason({ type: "maxBitrate", value: 4000 })).toBe(
      "Video bitrate 4500 exceeds max 4000",
    );
    expect(reason({ type: "audioCodec", value: "opus" })).toBe(
      "Audio codecs aac differ from opus",
    );
    expect(reason({ type: "subtitleLanguages", value: ["eng"] })).toBe(
      "Subtitle languages not allowed: fra",
    );
  });
});
