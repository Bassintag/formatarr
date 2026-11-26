import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient, JobId, JobUpdate, Task } from "@formatarr/contract";
import { ORPCError } from "@orpc/client";
import type { Transcode } from "@/lib/ffmpeg/run";
import { runJob } from "@/lib/job";

const id = 7 as JobId;
let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "formatarr-worker-"));
  spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const task = {
  job: { id, rules: [] },
  fileName: "movie.mkv",
  size: 6,
  mediaInfo: {},
} as unknown as Task;

async function until(condition: () => boolean) {
  while (!condition()) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup() {
  const update = mock(async (_: JobUpdate) => {});
  const source = mock(async () => new Blob(["source"]).stream());
  const result = mock(async () => {});
  const client = {
    jobs: { update, source, result },
  } as unknown as ApiClient;
  const transcoding = Promise.withResolvers<void>();
  const transcode = mock<Transcode>(async ({ outputPath }, { signal }) => {
    signal.addEventListener("abort", () => transcoding.reject(signal.reason));
    await transcoding.promise;
    await Bun.write(outputPath, "done");
  });
  const connection = new AbortController();
  const start = async () => {
    const done = runJob(
      { client, workDir, transcode },
      task,
      connection.signal,
    );
    await until(() => transcode.mock.calls.length > 0);
    const [, options] = transcode.mock.calls[0] as Parameters<Transcode>;
    return { done, options };
  };
  return { start, update, result, transcode, transcoding, connection, client };
}

function updates(update: ReturnType<typeof setup>["update"]) {
  return update.mock.calls.map(([input]) => input);
}

describe("runJob", () => {
  test("reports the progress periodically until the job is done", async () => {
    const { start, update, result, transcoding } = setup();
    const { done, options } = await start();

    await advance(2000);
    options.onProgress(40);
    await advance(2000);
    transcoding.resolve();
    await done;
    await advance(10_000);

    expect(updates(update)).toEqual([
      { id, progress: 0 },
      { id, progress: 40 },
    ]);
    expect(result).toHaveBeenCalledTimes(1);
  });

  test("cancels the job once the API no longer knows it", async () => {
    const { start, update, result } = setup();
    update.mockImplementation(async () => {
      throw new ORPCError("NOT_FOUND");
    });
    const { done, options } = await start();

    await advance(2000);
    await done;

    expect(options.signal.aborted).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  test("keeps running when a heartbeat fails", async () => {
    const { start, update, result, transcoding } = setup();
    update.mockImplementationOnce(async () => {
      throw new Error("ECONNRESET");
    });
    const { done, options } = await start();

    await advance(2000);
    await advance(2000);

    expect(options.signal.aborted).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);

    transcoding.resolve();
    await done;
    expect(result).toHaveBeenCalledTimes(1);
  });

  test("cancels without reporting when the connection drops", async () => {
    const { start, update, result, connection } = setup();
    const { done, options } = await start();

    connection.abort();
    await done;

    expect(options.signal.aborted).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(result).not.toHaveBeenCalled();
    expect(await readdir(workDir)).toEqual([]);
  });

  test("does not start on a dropped connection", async () => {
    const { client, transcode, connection } = setup();
    connection.abort();

    await runJob({ client, workDir, transcode }, task, connection.signal);

    expect(client.jobs.source).not.toHaveBeenCalled();
  });

  test("reports a failure with the last progress", async () => {
    const { start, update, transcoding } = setup();
    const { done, options } = await start();

    options.onProgress(30);
    transcoding.reject(new Error("boom"));
    await done;
    await advance(10_000);

    expect(updates(update)).toEqual([
      { id, progress: 30, status: "failed", error: "boom" },
    ]);
    expect(await readdir(workDir)).toEqual([]);
  });

  test("retries the failure report until it goes through", async () => {
    const { start, update, transcoding } = setup();
    update.mockImplementationOnce(async () => {
      throw new Error("ECONNRESET");
    });
    const { done } = await start();

    transcoding.reject(new Error("boom"));
    await until(() => update.mock.calls.length === 1);
    await advance(100);
    await done;

    expect(update).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["the job is gone", false],
    ["the connection drops", true],
  ])("gives up on the failure report when %s", async (_, drop) => {
    const { start, update, transcoding, connection } = setup();
    update.mockImplementation(async () => {
      throw drop ? new Error("ECONNRESET") : new ORPCError("NOT_FOUND");
    });
    const { done } = await start();

    transcoding.reject(new Error("boom"));
    await until(() => update.mock.calls.length === 1);
    if (drop) connection.abort();
    await done;

    expect(update).toHaveBeenCalledTimes(1);
  });
});
