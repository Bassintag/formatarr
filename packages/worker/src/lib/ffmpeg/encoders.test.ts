import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAccelerators } from "@/lib/ffmpeg/encoders";

let dir: string;

beforeEach(async () => {
  jest.useRealTimers();
  dir = await mkdtemp(join(tmpdir(), "formatarr-encoders-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fakeFfmpeg(...encoders: string[]) {
  const path = join(dir, "ffmpeg");
  const cases = encoders.map((encoder) => `*" ${encoder} "*) exit 0 ;;`);
  await Bun.write(
    path,
    `#!/bin/sh\ncase " $* " in\n${cases.join("\n")}\nesac\nexit 1\n`,
  );
  await chmod(path, 0o755);
  return path;
}

describe("detectAccelerators", () => {
  test("keeps the encoders that work", async () => {
    const ffmpeg = await fakeFfmpeg("h264_vaapi", "hevc_nvenc", "av1_qsv");

    expect(await detectAccelerators(ffmpeg)).toEqual({
      h264: "vaapi",
      hevc: "nvenc",
      av1: "qsv",
    });
  });

  test("prefers nvenc, then qsv, then vaapi", async () => {
    const ffmpeg = await fakeFfmpeg(
      "h264_vaapi",
      "h264_qsv",
      "h264_nvenc",
      "hevc_vaapi",
      "hevc_qsv",
    );

    expect(await detectAccelerators(ffmpeg)).toEqual({
      h264: "nvenc",
      hevc: "qsv",
    });
  });

  test("finds nothing without hardware", async () => {
    expect(await detectAccelerators(await fakeFfmpeg())).toEqual({});
  });
});
