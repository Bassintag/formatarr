import { describe, expect, test } from "bun:test";
import { files, jobs, libraries, rules, workers } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";
import { hashWorkerToken } from "@/workers/worker.lib";

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

    const [row] = await db.select().from(workers);
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
    const id = 999 as never;

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
  test("only running jobs are exposed", async () => {
    const { call, db } = setup();
    const worker = await call.workers.create({ name: "w1", capabilities });
    const library = await firstOrThrow(
      db
        .insert(libraries)
        .values({ name: "Movies", path: "/movies" })
        .returning(),
    );
    const rule = await firstOrThrow(
      db
        .insert(rules)
        .values({
          libraryId: library.id,
          name: "r",
          position: 0,
          conditions: [],
          actions: [{ type: "setContainer", container: "mkv" }],
        })
        .returning(),
    );
    const file = await firstOrThrow(
      db
        .insert(files)
        .values({ libraryId: library.id, path: "/movies/a.mkv", size: 1 })
        .returning(),
    );
    const base = { fileId: file.id, ruleId: rule.id, workerId: worker.id };
    await db.insert(jobs).values({ ...base, status: "queued" });
    const running = await firstOrThrow(
      db
        .insert(jobs)
        .values({ ...base, status: "running" })
        .returning(),
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
    expect(
      asWorker(created.token).workers.jobs({ id: created.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      asWorker(token).workers.jobs({ id: created.id }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  test("valid token passes the worker middleware", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(
      asWorker(created.token).workers.jobs({ id: created.id }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });

  test("unknown token is rejected", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(
      asWorker("fmw_nope").workers.jobs({ id: created.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("disabled worker is rejected", async () => {
    const { call, asWorker } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });
    await call.workers.update({ id: created.id, enabled: false });

    expect(
      asWorker(created.token).workers.jobs({ id: created.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("user credentials are rejected on worker routes", async () => {
    const { call } = setup();
    const created = await call.workers.create({ name: "w1", capabilities });

    expect(call.workers.jobs({ id: created.id })).rejects.toMatchObject({
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
