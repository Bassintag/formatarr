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

function setup() {
  const { call, db } = createTestCaller();
  const seedBase = async () => {
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
    const { worker, seedFile } = await seedBase();
    const a = await seedFile("/a");
    const b = await seedFile("/b");
    await db.insert(jobs).values([
      { fileId: a.id, status: "queued" },
      { fileId: a.id, workerId: worker.id, status: "running" },
      { fileId: b.id, status: "failed" },
    ]);
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
    const { seedFile } = await seedBase();
    const file = await seedFile("/a");
    await db.insert(jobs).values([1, 2, 3].map(() => ({ fileId: file.id })));

    const page = await call.jobs.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  test("get returns the job", async () => {
    const { call, db, seedBase } = setup();
    const { library, seedFile } = await seedBase();
    const file = await seedFile("/a");
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
    const { seedFile } = await seedBase();
    const file = await seedFile("/a");
    const job = await firstOrThrow(
      db.insert(jobs).values({ fileId: file.id }).returning(),
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
    const { library, seedFile } = await seedBase();
    const file = await seedFile("/a");
    const keep = seedRule(db, library.id, { type: "container", value: "mkv" });
    const drop = seedRule(db, library.id, { type: "maxBitrate", value: 1 });
    const job = seedJob(db, file.id, [keep.id, drop.id]);

    await call.rules.remove({ id: drop.id });

    expect(
      (await call.jobs.get({ id: job.id })).rules.map((r) => r.id),
    ).toEqual([keep.id]);
    await call.jobs.remove({ id: job.id });
    expect(await call.rules.get({ id: keep.id })).toMatchObject({
      id: keep.id,
    });
  });

  test("get of a missing job returns NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.jobs.get({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
