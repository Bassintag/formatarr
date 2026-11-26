import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFfmpegArgs, type TranscodeInput } from "@/lib/ffmpeg/command";
import { createTranscoder } from "@/lib/ffmpeg/run";

let dir: string;

beforeEach(async () => {
  jest.useRealTimers();
  dir = await mkdtemp(join(tmpdir(), "formatarr-ffmpeg-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function input(durationSeconds = 10) {
  return {
    job: { rules: [] },
    sourcePath: "source.mkv",
    outputPath: "output.mkv",
    mediaInfo: {
      durationSeconds,
      video: { codec: "h264" },
      audio: [],
      subtitles: [],
    },
  } as unknown as TranscodeInput;
}

async function fakeFfmpeg(script: string) {
  const path = join(dir, "ffmpeg");
  await Bun.write(path, `#!/bin/sh\n${script}\n`);
  await chmod(path, 0o755);
  return createTranscoder(path);
}

function options(signal = new AbortController().signal) {
  const progress: number[] = [];
  const lines: string[] = [];
  const logger = {
    info: (line: string) => lines.push(line),
    error: (line: string) => lines.push(line),
    flush: async () => {},
  };
  return {
    lines,
    logger,
    progress,
    signal,
    onProgress: (value: number) => progress.push(value),
  };
}

function outTimes(...values: (number | string)[]) {
  return values.map((value) => `echo out_time_us=${value}`).join("\n");
}

describe("createTranscoder", () => {
  test("runs ffmpeg with machine readable progress", async () => {
    const args = join(dir, "args");
    const transcode = await fakeFfmpeg(`printf '%s\\n' "$@" > ${args}`);

    await transcode(input(), options());

    expect((await Bun.file(args).text()).trim().split("\n")).toEqual([
      "-nostdin",
      "-v",
      "error",
      "-nostats",
      "-progress",
      "pipe:1",
      ...buildFfmpegArgs(input()),
    ]);
  });

  test("logs the command and every stderr line", async () => {
    const transcode = await fakeFfmpeg("printf 'first\\n\\nsecond\\nlast' >&2");
    const run = options();

    await transcode(input(), run);

    const [command, ...stderr] = run.lines;
    expect(command).toContain("-i source.mkv");
    expect(stderr).toEqual(["first", "second", "last"]);
  });

  test("turns the output time into a percentage below 100", async () => {
    const transcode = await fakeFfmpeg(
      outTimes("N/A", 1_000_000, 5_550_000, 12_000_000),
    );
    const run = options();

    await transcode(input(), run);

    expect(run.progress).toEqual([10, 55, 99]);
  });

  test("reports no progress without a duration", async () => {
    const transcode = await fakeFfmpeg(outTimes(1_000_000));
    const run = options();

    await transcode(input(0), run);

    expect(run.progress).toEqual([]);
  });

  test("fails with the end of stderr", async () => {
    const transcode = await fakeFfmpeg(
      "echo start >&2\nprintf '%05000d\\n' 0 >&2\necho 'Invalid data' >&2\nexit 3",
    );

    const error = await transcode(input(), options()).catch((error) => error);

    expect(error.message).toStartWith("ffmpeg exited with code 3: 000");
    expect(error.message).toEndWith("Invalid data");
    expect(error.message.length).toBeLessThan(4200);
  });

  test("kills ffmpeg when aborted", async () => {
    const transcode = await fakeFfmpeg(`${outTimes(1_000_000)}\nexec sleep 30`);
    const controller = new AbortController();

    const run = transcode(input(), {
      ...options(controller.signal),
      onProgress: () => controller.abort(),
    });

    await expect(run).rejects.toThrow("aborted");
  });

  test("does not spawn ffmpeg when already aborted", async () => {
    const marker = join(dir, "spawned");
    const transcode = await fakeFfmpeg(`touch ${marker}`);

    const run = transcode(input(), options(AbortSignal.abort()));

    await expect(run).rejects.toThrow("aborted");
    expect(await Bun.file(marker).exists()).toBe(false);
  });
});
