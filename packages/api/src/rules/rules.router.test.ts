import { describe, expect, test } from "bun:test";
import { libraries } from "@/db/schema";
import { createTestCaller } from "@/testing/harness";

const conditions = [
  { field: "videoCodec", operator: "neq", value: "hevc" },
] as const;
const actions = [{ type: "setContainer", container: "mkv" }] as const;

function setup() {
  const { call, db } = createTestCaller();
  const seedLibrary = async (name: string) => {
    const [row] = await db
      .insert(libraries)
      .values({ name, path: "/tmp" })
      .returning({ id: libraries.id });
    if (!row) throw new Error("seed failed");
    return row.id;
  };
  const rule = (
    libraryId: Awaited<ReturnType<typeof seedLibrary>>,
    name: string,
  ) => ({
    libraryId,
    name,
    enabled: true,
    conditions: [...conditions],
    actions: [...actions],
  });
  const names = async (libraryId: Awaited<ReturnType<typeof seedLibrary>>) =>
    (await call.rules.list({ libraryId, page: 0, pageSize: 50 })).items.map(
      (r) => r.name,
    );
  return { call, seedLibrary, rule, names };
}

describe("rules CRUD", () => {
  test("create and get", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = await seedLibrary("movies");

    const created = await call.rules.create(rule(library, "a"));

    expect(await call.rules.get({ id: created.id })).toEqual(created);
  });

  test("create rejects an unknown library", async () => {
    const { call, rule } = setup();
    expect(call.rules.create(rule(999 as never, "a"))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("list filters by library and paginates", async () => {
    const { call, seedLibrary, rule } = setup();
    const one = await seedLibrary("one");
    const two = await seedLibrary("two");
    for (const name of ["a", "b", "c"])
      await call.rules.create(rule(one, name));
    await call.rules.create(rule(two, "x"));

    const all = await call.rules.list({ page: 0, pageSize: 50 });
    const filtered = await call.rules.list({
      libraryId: one,
      page: 1,
      pageSize: 2,
    });

    expect(all.total).toBe(4);
    expect(filtered.total).toBe(3);
    expect(filtered.items.map((r) => r.name)).toEqual(["c"]);
  });

  test("update changes only provided fields", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = await seedLibrary("movies");
    const created = await call.rules.create(rule(library, "a"));

    const updated = await call.rules.update({
      id: created.id,
      enabled: false,
    });

    expect(updated).toEqual({ ...created, enabled: false });
  });

  test("update and get of a missing rule return NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.rules.get({ id: 999 as never })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      call.rules.update({ id: 999 as never, name: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("remove deletes the rule", async () => {
    const { call, seedLibrary, rule, names } = setup();
    const library = await seedLibrary("movies");
    await call.rules.create(rule(library, "a"));
    const b = await call.rules.create(rule(library, "b"));

    await call.rules.remove({ id: b.id });

    expect(await names(library)).toEqual(["a"]);
    expect(call.rules.remove({ id: b.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("create rejects invalid conditions and empty actions", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = await seedLibrary("movies");

    expect(
      call.rules.create({
        ...rule(library, "a"),
        conditions: [{ field: "width", operator: "in", value: 1 }],
      }),
    ).rejects.toThrow();
    expect(
      call.rules.create({ ...rule(library, "a"), actions: [] }),
    ).rejects.toThrow();
  });
});
