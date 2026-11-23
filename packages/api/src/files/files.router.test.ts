import { describe, expect, test } from "bun:test";
import { files, libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";

function setup() {
  const { call, db } = createTestCaller();
  const seedLibrary = (name: string) =>
    firstOrThrow(
      db
        .insert(libraries)
        .values({ name, path: "/tmp" })
        .returning({ id: libraries.id }),
    ).then((row) => row.id);
  const seedFile = (
    libraryId: Awaited<ReturnType<typeof seedLibrary>>,
    path: string,
    status: "pending" | "queued" | "processing" | "done" | "failed" = "pending",
  ) =>
    firstOrThrow(
      db
        .insert(files)
        .values({ libraryId, path, size: 1, status })
        .returning({ id: files.id }),
    ).then((row) => row.id);
  const paths = async (input: {
    libraryId?: Awaited<ReturnType<typeof seedLibrary>>;
    status?: "pending" | "done";
    search?: string;
  }) =>
    (await call.files.list({ page: 0, pageSize: 50, ...input })).items.map(
      (f) => f.path,
    );
  return { call, seedLibrary, seedFile, paths };
}

describe("files", () => {
  test("list filters by library", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const one = await seedLibrary("one");
    const two = await seedLibrary("two");
    await seedFile(one, "/a.mkv");
    await seedFile(two, "/b.mkv");

    expect(await paths({ libraryId: one })).toEqual(["/a.mkv"]);
    expect(await paths({})).toEqual(["/a.mkv", "/b.mkv"]);
  });

  test("list filters by status", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const library = await seedLibrary("one");
    await seedFile(library, "/a.mkv", "pending");
    await seedFile(library, "/b.mkv", "done");

    expect(await paths({ status: "done" })).toEqual(["/b.mkv"]);
  });

  test("list searches paths", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const library = await seedLibrary("one");
    await seedFile(library, "/movies/Alien.mkv");
    await seedFile(library, "/movies/Heat.mkv");

    expect(await paths({ search: "alien" })).toEqual(["/movies/Alien.mkv"]);
  });

  test("list paginates and reports the total", async () => {
    const { call, seedLibrary, seedFile } = setup();
    const library = await seedLibrary("one");
    for (const name of ["a", "b", "c"]) await seedFile(library, `/${name}`);

    const page = await call.files.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items.map((f) => f.path)).toEqual(["/c"]);
  });

  test("get returns the file", async () => {
    const { call, seedLibrary, seedFile } = setup();
    const library = await seedLibrary("one");
    const id = await seedFile(library, "/a.mkv");

    expect(await call.files.get({ id })).toEqual({
      id,
      libraryId: library,
      path: "/a.mkv",
      size: 1,
      mediaInfo: null,
      status: "pending",
      ignored: false,
    });
  });

  test("update toggles ignored", async () => {
    const { call, seedLibrary, seedFile } = setup();
    const library = await seedLibrary("one");
    const id = await seedFile(library, "/a.mkv");

    const ignored = await call.files.update({ id, ignored: true });
    const restored = await call.files.update({ id, ignored: false });

    expect(ignored.ignored).toBe(true);
    expect(restored.ignored).toBe(false);
  });

  test("get and update of a missing file return NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.files.get({ id: 999 as never })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      call.files.update({ id: 999 as never, ignored: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
