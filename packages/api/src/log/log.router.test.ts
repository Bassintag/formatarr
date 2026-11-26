import { describe, expect, test } from "bun:test";
import type { JobStatus } from "@formatarr/contract";
import { claimTask } from "@/task/task.lib";
import { createTestCaller } from "@/testing/harness";
import {
  sampleMediaInfo,
  seedFile,
  seedJob,
  seedLibrary,
  seedWorker,
  unknownId,
} from "@/testing/seed";
import { hashWorkerToken } from "@/worker/worker.lib";

function setup(status: JobStatus = "queued") {
  const { call, context, db } = createTestCaller();
  const asWorker = (token: string) => {
    const worker = seedWorker(db, {
      name: token,
      tokenHash: hashWorkerToken(token),
    });
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${token}` },
    });
    return { worker, call: createTestCaller({ ...context, request }).call };
  };
  const owner = asWorker("owner");
  const library = seedLibrary(db);
  const file = seedFile(db, library.id, {
    status: "queued",
    mediaInfo: sampleMediaInfo,
  });
  const job = seedJob(db, file.id, [], {
    status,
    workerId: status === "queued" ? null : owner.worker.id,
  });
  const messages = async () =>
    (await call.jobs.logs({ id: job.id })).map((log) => log.message);
  return { call, db, job, owner, asWorker, messages };
}

describe("jobs.logs", () => {
  test("a missing job is not found", async () => {
    const { call } = setup();

    await expect(call.jobs.logs({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("keeps the history of every attempt", async () => {
    const { call, db, job, owner, messages } = setup();
    await call.settings.update({ jobs: { maxRetries: 1 } });

    for (const error of ["first", "second"]) {
      claimTask(db, owner.worker.id);
      await owner.call.jobs.update({
        id: job.id,
        progress: 0,
        status: "failed",
        error,
      });
    }

    expect(await messages()).toEqual([
      "Attempt 1 started on worker owner",
      "first",
      "Attempt 2 started on worker owner",
      "second",
    ]);
    expect(await call.jobs.get({ id: job.id })).toMatchObject({
      status: "failed",
      attempts: 2,
    });
  });
});

describe("jobs.createLog", () => {
  test("appends a line to the running job", async () => {
    const { job, owner, messages } = setup("running");

    const log = await owner.call.jobs.createLog({
      id: job.id,
      message: "hello",
    });

    expect(log).toEqual({ message: "hello", createdAt: expect.any(Date) });
    expect(await messages()).toEqual(["hello"]);
  });

  test("rejects another worker", async () => {
    const { job, asWorker, messages } = setup("running");

    await expect(
      asWorker("other").call.jobs.createLog({ id: job.id, message: "hello" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await messages()).toEqual([]);
  });

  test("rejects a finished job", async () => {
    const { job, owner } = setup("failed");

    await expect(
      owner.call.jobs.createLog({ id: job.id, message: "hello" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("rejects an empty message", async () => {
    const { job, owner } = setup("running");

    await expect(
      owner.call.jobs.createLog({ id: job.id, message: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("rejects user credentials", async () => {
    const { call, job } = setup("running");

    await expect(
      call.jobs.createLog({ id: job.id, message: "hello" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
