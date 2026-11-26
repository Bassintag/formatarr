import { describe, expect, test } from "bun:test";
import type { MediaInfo, RuleValue } from "@formatarr/contract";
import { buildFfmpegArgs, type TranscodeInput } from "@/lib/ffmpeg/command";

const mediaInfo: MediaInfo = {
  container: "mkv",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "hevc", width: 1920, height: 1080, bitrate: 4500 },
  audio: [{ codec: "aac", language: "eng", channels: 2 }],
  subtitles: [],
};

function build(rules: RuleValue[], info: Partial<MediaInfo> = {}) {
  return buildFfmpegArgs({
    job: { rules: rules.map((rule) => ({ ...rule, enabled: true })) },
    sourcePath: "/media/in.mkv",
    outputPath: "/media/out.mkv",
    mediaInfo: { ...mediaInfo, ...info },
  } as TranscodeInput);
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function options(args: string[], name: string) {
  return args.filter((_, index) => args[index - 1] === name);
}

describe("buildFfmpegArgs", () => {
  test("copies every stream without rules", () => {
    expect(build([])).toEqual([
      "-i",
      "/media/in.mkv",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-map",
      "0:t?",
      "-c",
      "copy",
      "/media/out.mkv",
    ]);
  });

  test("ignores disabled rules", () => {
    const args = buildFfmpegArgs({
      job: { rules: [{ type: "videoCodec", value: "av1", enabled: false }] },
      sourcePath: "/media/in.mkv",
      outputPath: "/media/out.mkv",
      mediaInfo,
    } as TranscodeInput);

    expect(args).toEqual(build([]));
  });

  test("does not depend on the order of the rules", () => {
    const rules: RuleValue[] = [
      { type: "container", value: "mp4" },
      { type: "videoCodec", value: "h264" },
      { type: "maxBitrate", value: 3000 },
      { type: "audioCodec", value: "ac3" },
    ];

    expect(build(rules.toReversed())).toEqual(build(rules));
  });

  describe("video", () => {
    test.each([
      ["h264", "libx264"],
      ["hevc", "libx265"],
      ["av1", "libsvtav1"],
      ["vp9", "libvpx-vp9"],
    ] as const)("encodes %s with %s", (value, encoder) => {
      expect(option(build([{ type: "videoCodec", value }]), "-c:v")).toBe(
        encoder,
      );
    });

    test("keeps the source codec when only the resolution is unmet", () => {
      const args = build([{ type: "maxResolution", value: 720 }]);

      expect(option(args, "-c:v")).toBe("libx265");
      expect(option(args, "-filter:v")).toBe("scale=-2:720");
    });

    test("falls back to h264 for an unsupported source codec", () => {
      const args = build([{ type: "maxResolution", value: 720 }], {
        video: { ...mediaInfo.video, codec: "mpeg2video" },
      });

      expect(option(args, "-c:v")).toBe("libx264");
    });

    test("rounds an odd height down", () => {
      const args = build([{ type: "maxResolution", value: 481 }]);

      expect(option(args, "-filter:v")).toBe("scale=-2:480");
    });

    test("targets 90% of the max bitrate and declares the max", () => {
      const args = build([{ type: "maxBitrate", value: 3000 }]);

      expect(option(args, "-b:v")).toBe("2700");
      expect(option(args, "-maxrate")).toBe("3000");
      expect(option(args, "-bufsize")).toBe("6000");
      expect(options(args, "-metadata:s:v:0")).toEqual([
        "BPS=3000",
        "BPS-eng=",
      ]);
    });

    test("does not give a max rate to the av1 encoder", () => {
      const args = build([
        { type: "videoCodec", value: "av1" },
        { type: "maxBitrate", value: 3000 },
      ]);

      expect(option(args, "-b:v")).toBe("2700");
      expect(args).not.toContain("-maxrate");
    });

    test("clears the stale bitrate tags without a max bitrate", () => {
      const args = build([{ type: "videoCodec", value: "h264" }]);

      expect(args).not.toContain("-b:v");
      expect(options(args, "-metadata:s:v:0")).toEqual(["BPS=", "BPS-eng="]);
    });

    test("uses constant quality for vp9 without a max bitrate", () => {
      const args = build([{ type: "videoCodec", value: "vp9" }]);

      expect(option(args, "-crf")).toBe("32");
      expect(option(args, "-b:v")).toBe("0");
    });
  });

  describe("audio", () => {
    const audio = [
      { codec: "aac", language: "eng", channels: 2 },
      { codec: "truehd", language: "eng", channels: 8 },
    ];

    test("converts only the tracks with another codec", () => {
      const args = build([{ type: "audioCodec", value: "aac" }], { audio });

      expect(options(args, "-map")).toContain("0:a:1");
      expect(args).not.toContain("-c:a:0");
      expect(option(args, "-c:a:1")).toBe("aac");
      expect(args).not.toContain("-ac:a:1");
    });

    test.each([
      ["ac3", "6"],
      ["eac3", "6"],
      ["mp3", "2"],
    ] as const)("limits the channels of %s to %s", (value, channels) => {
      const args = build([{ type: "audioCodec", value }], { audio });

      expect(option(args, "-ac:a:1")).toBe(channels);
    });

    test("normalizes the channel layout for opus", () => {
      const args = build([{ type: "audioCodec", value: "opus" }], { audio });

      expect(option(args, "-c:a:1")).toBe("libopus");
      expect(option(args, "-filter:a:1")).toStartWith("aformat=");
    });

    test("converts to aac the tracks mp4 cannot hold", () => {
      const args = build([{ type: "container", value: "mp4" }], { audio });

      expect(args).not.toContain("-c:a:0");
      expect(option(args, "-c:a:1")).toBe("aac");
    });
  });

  describe("subtitles", () => {
    const subtitles = [
      { codec: "hdmv_pgs_subtitle", language: "eng" },
      { codec: "subrip", language: "fre" },
      { codec: "mov_text", language: "eng" },
    ];

    test("maps the allowed tracks and indexes the output ones", () => {
      const args = build([{ type: "subtitleLanguages", value: ["eng"] }], {
        subtitles,
      });

      expect(options(args, "-map")).toEqual([
        "0:v:0",
        "0:a:0",
        "0:s:0",
        "0:s:2",
        "0:t?",
      ]);
      expect(args).not.toContain("-c:s:0");
      expect(option(args, "-c:s:1")).toBe("srt");
    });

    test("converts text tracks and drops the other ones for mp4", () => {
      const args = build([{ type: "container", value: "mp4" }], { subtitles });

      expect(options(args, "-map")).toEqual([
        "0:v:0",
        "0:a:0",
        "0:s:1",
        "0:s:2",
      ]);
      expect(option(args, "-c:s:0")).toBe("mov_text");
      expect(args).not.toContain("-c:s:1");
    });

    test("leaves the tracks of other containers untouched", () => {
      const args = build([], { container: "avi", subtitles });

      expect(args.some((arg) => arg.startsWith("-c:s"))).toBe(false);
      expect(options(args, "-map")).not.toContain("0:t?");
    });
  });
});
