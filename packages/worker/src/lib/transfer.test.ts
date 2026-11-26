import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ApiClient, JobResult, Rule, Task } from "@formatarr/contract";
import type { TranscodeInput } from "@/lib/ffmpeg/command";
import { processTask } from "@/lib/transfer";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "formatarr-worker-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function setup({ rules = [] as Partial<Rule>[], size = 6 } = {}) {
  const task = {
    job: { id: 7, rules },
    fileName: "Movie (2020).avi",
    size,
    mediaInfo: {},
  } as unknown as Task;
  const uploads: { id: number; size: number; content: string }[] = [];
  const result = mock(async ({ params, query, body }: JobResult) => {
    const content = await new Response(body).text();
    uploads.push({ id: params.id, size: query.size, content });
  });
  const source = mock(async () => new Blob(["source"]).stream());
  const client = { jobs: { source, result } } as unknown as ApiClient;
  const transcode = mock(async ({ sourcePath, outputPath }: TranscodeInput) => {
    const content = await Bun.file(sourcePath).text();
    await Bun.write(outputPath, `${content} converted`);
  });
  const run = () => processTask({ client, workDir }, task, transcode);
  return { run, transcode, source, result, uploads };
}

describe("processTask", () => {
  test("uploads the transcoded download and cleans up", async () => {
    const { run, source, uploads } = setup();

    await run();

    expect(source).toHaveBeenCalledWith({ id: 7 });
    expect(uploads).toEqual([{ id: 7, size: 16, content: "source converted" }]);
    expect(await readdir(workDir)).toEqual([]);
  });

  test.each([
    ["the container rule", true, "output.mp4"],
    ["the source when the rule is disabled", false, "output.avi"],
  ])("takes the output extension from %s", async (_, enabled, expected) => {
    const { run, transcode } = setup({
      rules: [{ type: "container", value: "mp4", enabled }],
    });

    await run();

    const [input] = transcode.mock.calls[0] as [TranscodeInput];
    expect(basename(input.sourcePath)).toBe("source.avi");
    expect(basename(input.outputPath)).toBe(expected);
  });

  test("starts from an empty job directory", async () => {
    const { run, transcode } = setup();
    await Bun.write(join(workDir, "job-7", "stale"), "x");
    let files: string[] = [];
    transcode.mockImplementationOnce(async ({ outputPath }) => {
      files = await readdir(join(workDir, "job-7"));
      await Bun.write(outputPath, "done");
    });

    await run();

    expect(files).toEqual(["source.avi"]);
  });

  test("rejects a download of the wrong size", async () => {
    const { run, transcode, result } = setup({ size: 100 });

    await expect(run()).rejects.toThrow("size");

    expect(transcode).not.toHaveBeenCalled();
    expect(result).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  test("cleans up when the transcoding fails", async () => {
    const { run, transcode, result } = setup();
    transcode.mockImplementationOnce(async () => {
      throw new Error("boom");
    });

    await expect(run()).rejects.toThrow("boom");

    expect(result).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });
});
