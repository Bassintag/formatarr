import { describe, expect, test } from "bun:test";
import type { FileStatus, LibraryId } from "@formatarr/contract";
import { createTestCaller } from "@/testing/harness";
import { seedFile, seedLibrary, unknownId } from "@/testing/seed";

function setup() {
  const { call, db } = createTestCaller();
  const library = (name: string) => seedLibrary(db, { name }).id;
  const file = (
    libraryId: LibraryId,
    path: string,
    status: FileStatus = "pending",
  ) => seedFile(db, libraryId, { path, status }).id;
  const paths = async (input: {
    libraryId?: LibraryId;
    status?: "pending" | "done";
    search?: string;
  }) =>
    (await call.files.list({ page: 0, pageSize: 50, ...input })).items.map(
      (f) => f.path,
    );
  return { call, seedLibrary: library, seedFile: file, paths };
}

describe("files", () => {
  test("list filters by library", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const one = seedLibrary("one");
    const two = seedLibrary("two");
    seedFile(one, "/a.mkv");
    seedFile(two, "/b.mkv");

    expect(await paths({ libraryId: one })).toEqual(["/a.mkv"]);
    expect(await paths({})).toEqual(["/a.mkv", "/b.mkv"]);
  });

  test("list filters by status", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const library = seedLibrary("one");
    seedFile(library, "/a.mkv", "pending");
    seedFile(library, "/b.mkv", "done");

    expect(await paths({ status: "done" })).toEqual(["/b.mkv"]);
  });

  test("list searches paths", async () => {
    const { seedLibrary, seedFile, paths } = setup();
    const library = seedLibrary("one");
    seedFile(library, "/movies/Alien.mkv");
    seedFile(library, "/movies/Heat.mkv");

    expect(await paths({ search: "alien" })).toEqual(["/movies/Alien.mkv"]);
  });

  test("list paginates and reports the total", async () => {
    const { call, seedLibrary, seedFile } = setup();
    const library = seedLibrary("one");
    for (const name of ["a", "b", "c"]) seedFile(library, `/${name}`);

    const page = await call.files.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items.map((f) => f.path)).toEqual(["/c"]);
  });

  test("get returns the file", async () => {
    const { call, seedLibrary, seedFile } = setup();
    const library = seedLibrary("one");
    const id = seedFile(library, "/a.mkv");

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
    const library = seedLibrary("one");
    const id = seedFile(library, "/a.mkv");

    const ignored = await call.files.update({ id, ignored: true });
    const restored = await call.files.update({ id, ignored: false });

    expect(ignored.ignored).toBe(true);
    expect(restored.ignored).toBe(false);
  });

  test("get and update of a missing file return NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.files.get({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      call.files.update({ id: unknownId, ignored: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
