import { describe, expect, test } from "bun:test";
import type { MediaInfo } from "@formatarr/contract";
import { createPlan } from "@/lib/ffmpeg/plan";
import { translators } from "@/lib/ffmpeg/translators";

const mediaInfo: MediaInfo = {
  container: "mkv",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080, bitrate: 4500 },
  audio: [
    { codec: "aac", language: "eng", channels: 2 },
    { codec: "ac3", language: "fre", channels: 6 },
  ],
  subtitles: [
    { codec: "subrip", language: "eng" },
    { codec: "subrip", language: "fre" },
    { codec: "ass", language: null },
  ],
};

const plan = createPlan(mediaInfo);

describe("translators", () => {
  test("the initial plan copies everything", () => {
    expect(plan).toMatchObject({
      container: "mkv",
      audio: [{ index: 0 }, { index: 1 }],
      subtitles: [{ index: 0 }, { index: 1 }, { index: 2 }],
    });
    expect(plan.video).toBeUndefined();
  });

  test("container", () => {
    expect(translators.container(plan, "mp4").container).toBe("mp4");
  });

  test("videoCodec", () => {
    expect(translators.videoCodec(plan, "hevc").video).toEqual({
      codec: "hevc",
    });
  });

  test("maxResolution", () => {
    expect(translators.maxResolution(plan, 720).video).toEqual({ height: 720 });
  });

  test("maxBitrate", () => {
    expect(translators.maxBitrate(plan, 3000).video).toEqual({
      maxBitrate: 3000,
    });
  });

  test("video translators merge their settings", () => {
    const merged = translators.maxBitrate(
      translators.maxResolution(translators.videoCodec(plan, "av1"), 720),
      3000,
    );
    expect(merged.video).toEqual({
      codec: "av1",
      height: 720,
      maxBitrate: 3000,
    });
  });

  test("audioCodec targets only the tracks with another codec", () => {
    const { audio } = translators.audioCodec(plan, "aac");

    expect(audio.map((track) => track.target)).toEqual([undefined, "aac"]);
  });

  test("subtitleLanguages keeps the allowed and untagged tracks", () => {
    const { subtitles } = translators.subtitleLanguages(plan, ["fre"]);

    expect(subtitles.map((track) => track.index)).toEqual([1, 2]);
  });

  test("translators leave the given plan untouched", () => {
    translators.videoCodec(plan, "hevc");
    translators.audioCodec(plan, "opus");
    translators.subtitleLanguages(plan, []);

    expect(plan).toEqual(createPlan(mediaInfo));
  });
});
