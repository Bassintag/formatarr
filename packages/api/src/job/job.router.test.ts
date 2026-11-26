import { describe, expect, test } from "bun:test";
import type { Rule } from "@formatarr/contract";
import { jobs } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";
import {
  seedFile,
  seedJob,
  seedLibrary,
  seedRule,
  seedWorker,
  unknownId,
} from "@/testing/seed";
import { hashWorkerToken } from "@/worker/worker.lib";

function setup() {
  const { call, db } = createTestCaller();
  const seedBase = () => {
    const library = seedLibrary(db);
    const worker = seedWorker(db);
    const file = (path: string) => seedFile(db, library.id, { path });
    return { library, worker, seedFile: file };
  };
  return { call, db, seedBase };
}

describe("jobs", () => {
  test("list filters by status, worker and file", async () => {
    const { call, db, seedBase } = setup();
    const { worker, seedFile } = seedBase();
    const a = seedFile("/a");
    const b = seedFile("/b");
    db.insert(jobs)
      .values([
        { fileId: a.id, status: "queued" },
        { fileId: a.id, workerId: worker.id, status: "running" },
        { fileId: b.id, status: "failed" },
      ])
      .run();
    const list = async (input: object) =>
      (await call.jobs.list({ page: 0, pageSize: 50, ...input })).items.map(
        (j) => j.status,
      );

    expect(await list({})).toEqual(["queued", "running", "failed"]);
    expect(await list({ status: "running" })).toEqual(["running"]);
    expect(await list({ workerId: worker.id })).toEqual(["running"]);
    expect(await list({ fileId: b.id })).toEqual(["failed"]);
  });

  test("list paginates and reports the total", async () => {
    const { call, db, seedBase } = setup();
    const { seedFile } = seedBase();
    const file = seedFile("/a");
    db.insert(jobs)
      .values([1, 2, 3].map(() => ({ fileId: file.id })))
      .run();

    const page = await call.jobs.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  test("get returns the job", async () => {
    const { call, db, seedBase } = setup();
    const { library, seedFile } = seedBase();
    const file = seedFile("/a");
    const rule = seedRule(db, library.id, { type: "maxBitrate", value: 8000 });
    const job = seedJob(db, file.id, [rule.id]);

    expect(await call.jobs.get({ id: job.id })).toEqual({
      id: job.id,
      fileId: file.id,
      rules: [rule as Rule],
      workerId: null,
      status: "queued",
      progress: 0,
      error: null,
      createdAt: job.createdAt,
      startedAt: null,
      finishedAt: null,
    });
  });

  test("remove deletes the job and keeps the file", async () => {
    const { call, db, seedBase } = setup();
    const { seedFile } = seedBase();
    const file = seedFile("/a");
    const job = firstOrThrow(
      db.insert(jobs).values({ fileId: file.id }).returning().all(),
    );

    await call.jobs.remove({ id: job.id });

    expect(await call.files.get({ id: file.id })).toMatchObject({
      id: file.id,
    });
    expect(call.jobs.get({ id: job.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.jobs.remove({ id: job.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("deleting a rule removes it from the job and deleting the job keeps the rule", async () => {
    const { call, db, seedBase } = setup();
    const { library, seedFile } = seedBase();
    const file = seedFile("/a");
    const keep = seedRule(db, library.id, { type: "container", value: "mkv" });
    const drop = seedRule(db, library.id, { type: "maxBitrate", value: 1 });
    const job = seedJob(db, file.id, [keep.id, drop.id]);

    await call.libraries.update({
      id: library.id,
      rules: [{ enabled: true, type: "container", value: "mkv" }],
    });

    expect(
      (await call.jobs.get({ id: job.id })).rules.map((r) => r.id),
    ).toEqual([keep.id]);
    await call.jobs.remove({ id: job.id });
    expect(
      (await call.libraries.get({ id: library.id })).rules.map((r) => r.id),
    ).toEqual([keep.id]);
  });

  test("get of a missing job returns NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.jobs.get({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("jobs.update", () => {
  function setupRunning() {
    const { call, context, db } = createTestCaller();
    const library = seedLibrary(db);
    const file = seedFile(db, library.id, { status: "processing" });
    const asWorker = (token: string) => {
      const worker = seedWorker(db, { tokenHash: hashWorkerToken(token) });
      const request = new Request("http://localhost", {
        headers: { authorization: `Bearer ${token}` },
      });
      return { worker, call: createTestCaller({ ...context, request }).call };
    };
    const owner = asWorker("owner");
    const job = seedJob(db, file.id, [], {
      workerId: owner.worker.id,
      status: "running",
    });
    return { call, file, job, owner, asWorker };
  }

  test("reports progress", async () => {
    const { job, owner } = setupRunning();

    const updated = await owner.call.jobs.update({ id: job.id, progress: 40 });

    expect(updated).toMatchObject({
      status: "running",
      progress: 40,
      finishedAt: null,
    });
  });

  test("failure completes the job and the file", async () => {
    const { call, file, job, owner } = setupRunning();
    const updated = await owner.call.jobs.update({
      id: job.id,
      progress: 40,
      status: "failed",
      error: "boom",
    });

    expect(updated).toMatchObject({
      status: "failed",
      progress: 40,
      error: "boom",
      finishedAt: new Date(),
    });
    expect(await call.files.get({ id: file.id })).toMatchObject({
      status: "failed",
    });
  });

  test("another worker is rejected", async () => {
    const { job, asWorker } = setupRunning();

    expect(
      asWorker("other").call.jobs.update({ id: job.id, progress: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a finished job cannot be updated again", async () => {
    const { job, owner } = setupRunning();
    const update = { id: job.id, progress: 100 };
    await owner.call.jobs.update({ ...update, status: "failed" });

    expect(
      owner.call.jobs.update({ ...update, status: "failed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("unknown jobs are not found", async () => {
    const { owner } = setupRunning();

    expect(
      owner.call.jobs.update({ id: unknownId, progress: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("user credentials are rejected", async () => {
    const { call, job } = setupRunning();

    expect(call.jobs.update({ id: job.id, progress: 1 })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" },
    );
  });
});
