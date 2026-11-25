import { describe, expect, test } from "bun:test";
import { jobs } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";
import {
  seedFile,
  seedLibrary,
  seedRule,
  seedWorker,
  unknownId,
} from "@/testing/seed";

function setup() {
  const { call, db } = createTestCaller();
  const seedBase = async () => {
    const library = seedLibrary(db);
    const rule = seedRule(db, library.id);
    const worker = seedWorker(db);
    const file = (path: string) => seedFile(db, library.id, { path });
    return { rule, worker, seedFile: file };
  };
  return { call, db, seedBase };
}

describe("jobs", () => {
  test("list filters by status, worker and file", async () => {
    const { call, db, seedBase } = setup();
    const { rule, worker, seedFile } = await seedBase();
    const a = await seedFile("/a");
    const b = await seedFile("/b");
    await db.insert(jobs).values([
      { fileId: a.id, ruleId: rule.id, status: "queued" },
      { fileId: a.id, ruleId: rule.id, workerId: worker.id, status: "running" },
      { fileId: b.id, ruleId: rule.id, status: "failed" },
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
    const { rule, seedFile } = await seedBase();
    const file = await seedFile("/a");
    await db
      .insert(jobs)
      .values([1, 2, 3].map(() => ({ fileId: file.id, ruleId: rule.id })));

    const page = await call.jobs.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
  });

  test("get returns the job", async () => {
    const { call, db, seedBase } = setup();
    const { rule, seedFile } = await seedBase();
    const file = await seedFile("/a");
    const job = await firstOrThrow(
      db.insert(jobs).values({ fileId: file.id, ruleId: rule.id }).returning(),
    );

    expect(await call.jobs.get({ id: job.id })).toEqual({
      id: job.id,
      fileId: file.id,
      ruleId: rule.id,
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
    const { rule, seedFile } = await seedBase();
    const file = await seedFile("/a");
    const job = await firstOrThrow(
      db.insert(jobs).values({ fileId: file.id, ruleId: rule.id }).returning(),
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

  test("get of a missing job returns NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.jobs.get({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
