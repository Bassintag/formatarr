import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { integrations, libraryIntegrations } from "@/db/schema";
import { createTestCaller } from "@/testing/harness";

function setup() {
  const { call, db } = createTestCaller();
  const dir = mkdtempSync(join(tmpdir(), "formatarr-lib-"));
  const seedIntegration = async (name: string) => {
    const [row] = await db
      .insert(integrations)
      .values({ type: "radarr", name, baseUrl: "http://x", apiKey: "k" })
      .returning({ id: integrations.id });
    if (!row) throw new Error("seed failed");
    return row.id;
  };
  return { call, db, dir, seedIntegration };
}

describe("libraries CRUD", () => {
  test("create returns the library with its integration ids", async () => {
    const { call, dir, seedIntegration } = setup();
    const integrationId = await seedIntegration("r1");

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
    writeFileSync(file, "x");
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
        integrations: [{ id: 999 as never }],
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
    const first = await seedIntegration("r1");
    const second = await seedIntegration("r2");
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
    const integrationId = await seedIntegration("r1");
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
    expect(await db.select().from(libraryIntegrations)).toEqual([]);
  });

  test("unknown ids are not found", async () => {
    const { call } = setup();
    const id = 999 as never;

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
