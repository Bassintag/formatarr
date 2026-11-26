import { describe, expect, test } from "bun:test";
import { jobs, workers } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";
import { seedFile, seedJob, seedLibrary, unknownId } from "@/testing/seed";
import { hashWorkerToken } from "@/worker/worker.lib";

const capabilities = { ffmpegVersion: "7.0", hwaccels: ["vaapi"] };

function withToken(token: string) {
  return new Request("http://localhost", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function setup() {
  const { call, context, db } = createTestCaller();
  const asWorker = (token: string) =>
    createTestCaller({ ...context, request: withToken(token) }).call;
  return { call, context, db, asWorker };
}

describe("workers CRUD", () => {
  test("create returns the token once and stores only its hash", async () => {
    const { call, db } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(created.token).toStartWith("fmw_");
    expect(created).not.toHaveProperty("tokenHash");
    expect(created.runningJobs).toEqual([]);

    const [row] = db.select().from(workers).all();
    expect(row?.tokenHash).not.toBe(created.token);
    expect(row?.tokenHash).toBe(hashWorkerToken(created.token));

    const fetched = await call.workers.get({ id: created.id });
    expect(fetched).not.toHaveProperty("token");
  });

  test("list paginates", async () => {
    const { call } = setup();
    for (const name of ["a", "b", "c"]) {
      await call.workers.create({ name, capabilities });
    }

    const page = await call.workers.list({ page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((w) => w.name)).toEqual(["c"]);
  });

  test("update changes only provided fields", async () => {
    const { call } = setup();
    const { id } = await call.workers.create({ name: "w1", capabilities });

    const updated = await call.workers.update({
      id,
      enabled: false,
      pathMappings: [{ from: "/a", to: "/b" }],
    });
    expect(updated.name).toBe("w1");
    expect(updated.enabled).toBe(false);
    expect(updated.pathMappings).toEqual([{ from: "/a", to: "/b" }]);
  });

  test("remove deletes the worker", async () => {
    const { call } = setup();
    const { id } = await call.workers.create({ name: "w1", capabilities });

    await call.workers.remove({ id });
    expect(call.workers.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("unknown ids are not found", async () => {
    const { call } = setup();
    const id = unknownId;

    expect(call.workers.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.workers.update({ id, name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.workers.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.workers.regenerateToken({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("requires user authentication", async () => {
    const { call } = createTestCaller({}, { authenticated: false });
    expect(call.workers.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("running jobs", () => {
  test("removing a worker requeues its running jobs", async () => {
    const { call, db } = setup();
    const worker = await call.workers.create({ name: "w1", capabilities });
    const library = seedLibrary(db);
    const file = seedFile(db, library.id, { status: "processing" });
    const job = seedJob(db, file.id, [], {
      workerId: worker.id,
      status: "running",
      progress: 50,
      startedAt: new Date(),
    });

    await call.workers.remove({ id: worker.id });

    expect(await call.jobs.get({ id: job.id })).toMatchObject({
      status: "queued",
      workerId: null,
      progress: 0,
      startedAt: null,
    });
    expect(await call.files.get({ id: file.id })).toMatchObject({
      status: "queued",
    });
  });

  test("only running jobs are exposed", async () => {
    const { call, db } = setup();
    const worker = await call.workers.create({ name: "w1", capabilities });
    const library = seedLibrary(db);
    const file = seedFile(db, library.id);
    const base = { fileId: file.id, workerId: worker.id };
    db.insert(jobs)
      .values({ ...base, status: "queued" })
      .run();
    const running = firstOrThrow(
      db
        .insert(jobs)
        .values({ ...base, status: "running" })
        .returning()
        .all(),
    );

    const fetched = await call.workers.get({ id: worker.id });
    expect(fetched.runningJobs).toEqual([{ id: running.id }]);

    const page = await call.workers.list({});
    expect(page.items[0]?.runningJobs).toEqual([{ id: running.id }]);
  });
});

describe("worker token", () => {
  test("regenerate replaces the previous token", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });
    const { token } = await call.workers.regenerateToken({ id: created.id });

    expect(token).not.toBe(created.token);
    expect(asWorker(created.token).tasks.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(asWorker(token).tasks.stream()).resolves.toBeDefined();
  });

  test("valid token passes the worker middleware", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(asWorker(created.token).tasks.stream()).resolves.toBeDefined();
  });

  test("unknown token is rejected", async () => {
    const { asWorker } = setup();

    expect(asWorker("fmw_nope").tasks.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("disabled worker is rejected", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });
    await call.workers.update({ id: created.id, enabled: false });

    expect(asWorker(created.token).tasks.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("user credentials are rejected on worker routes", async () => {
    const { call } = setup();

    expect(call.tasks.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("worker token is rejected on user routes", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(asWorker(created.token).workers.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
