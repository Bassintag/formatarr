import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { integrations, libraryIntegrations } from "@/db/schema";
import { createTestCaller, noopScanScheduler } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";
import { unknownId } from "@/testing/seed";

function setup() {
  const { call, db } = createTestCaller();
  const dir = "/media/lib";
  mockFileSystem({ [join(dir, "file.txt")]: "x" });
  const seedIntegration = (name: string) => {
    const row = db
      .insert(integrations)
      .values({ type: "radarr", name, baseUrl: "http://x", apiKey: "k" })
      .returning({ id: integrations.id })
      .get();
    return row.id;
  };
  return { call, db, dir, seedIntegration };
}

describe("libraries CRUD", () => {
  test("create returns the library with its integration ids", async () => {
    const { call, dir, seedIntegration } = setup();
    const integrationId = seedIntegration("r1");

    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: integrationId }],
    });

    expect(created.integrations).toEqual([{ id: integrationId }]);
    expect(await call.libraries.get({ id: created.id })).toEqual(created);
  });

  test("create rejects invalid paths and unknown integrations", async () => {
    const { call, dir } = setup();
    const file = join(dir, "file.txt");
    const base = { name: "movies", enabled: true, integrations: [] };

    expect(
      call.libraries.create({ ...base, path: join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.libraries.create({ ...base, path: file }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.libraries.create({
        ...base,
        path: dir,
        integrations: [{ id: unknownId }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await call.libraries.list({ page: 0, pageSize: 10 })).total).toBe(
      0,
    );
  });

  test("list paginates", async () => {
    const { call, dir } = setup();
    for (const name of ["a", "b", "c"]) {
      await call.libraries.create({
        name,
        path: dir,
        enabled: true,
        integrations: [],
      });
    }

    const page = await call.libraries.list({ page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((l) => l.name)).toEqual(["c"]);
  });

  test("update changes only provided fields and replaces integrations", async () => {
    const { call, dir, seedIntegration } = setup();
    const first = seedIntegration("r1");
    const second = seedIntegration("r2");
    const { id } = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: first }],
    });

    const renamed = await call.libraries.update({ id, name: "films" });
    expect(renamed.name).toBe("films");
    expect(renamed.path).toBe(dir);
    expect(renamed.integrations).toEqual([{ id: first }]);

    const relinked = await call.libraries.update({
      id,
      integrations: [{ id: second }],
    });
    expect(relinked.integrations).toEqual([{ id: second }]);

    const cleared = await call.libraries.update({ id, integrations: [] });
    expect(cleared.integrations).toEqual([]);

    expect(
      call.libraries.update({ id, path: join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("remove deletes the library and its links", async () => {
    const { call, db, dir, seedIntegration } = setup();
    const integrationId = seedIntegration("r1");
    const { id } = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: integrationId }],
    });

    await call.libraries.remove({ id });

    expect(call.libraries.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.select().from(libraryIntegrations).all()).toEqual([]);
  });

  test("unknown ids are not found", async () => {
    const { call } = setup();
    const id = unknownId;

    expect(call.libraries.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.update({ id, name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.update({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("libraries scan scheduling", () => {
  function setupScheduler() {
    const update = mock(async () => {});
    const remove = mock(() => {});
    const { call, db } = createTestCaller({
      schedulers: { scan: { ...noopScanScheduler, update, remove } },
    });
    const dir = "/media/lib";
    mockFileSystem({ [join(dir, "file.txt")]: "x" });
    return { call, db, dir, update, remove };
  }

  test("scanCron and watch default to null and false", async () => {
    const { call, dir } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    expect(created.scanCron).toBeNull();
    expect(created.watch).toBe(false);
  });

  test("create and update persist scheduling and notify the scheduler", async () => {
    const { call, dir, update } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      scanCron: "*/5 * * * *",
      watch: true,
      integrations: [],
    });
    expect(created.scanCron).toBe("*/5 * * * *");
    expect(created.watch).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);

    const updated = await call.libraries.update({
      id: created.id,
      scanCron: null,
      watch: false,
    });
    expect(updated.scanCron).toBeNull();
    expect(updated.watch).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
  });

  test("update without scheduling fields keeps them", async () => {
    const { call, dir } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      scanCron: "*/5 * * * *",
      watch: true,
      integrations: [],
    });
    const renamed = await call.libraries.update({
      id: created.id,
      name: "films",
    });
    expect(renamed.scanCron).toBe("*/5 * * * *");
    expect(renamed.watch).toBe(true);
  });

  test("invalid cron expressions are rejected", async () => {
    const { call, dir, update } = setupScheduler();
    expect(
      call.libraries.create({
        name: "movies",
        path: dir,
        enabled: true,
        scanCron: "nope",
        integrations: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    expect(
      call.libraries.update({ id: created.id, scanCron: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("remove unschedules the library", async () => {
    const { call, dir, remove } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    await call.libraries.remove({ id: created.id });
    expect(remove).toHaveBeenCalledWith(created.id);
  });
});
