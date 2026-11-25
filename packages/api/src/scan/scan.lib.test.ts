import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { files } from "@/db/schema";
import { scanLibrary } from "@/scan/scan.lib";
import { createTestContext } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";
import { seedFile, seedLibrary, unknownId } from "@/testing/seed";

async function setup() {
  const context = createTestContext();
  const root = "/media";
  const disk = mockFileSystem({
    [join(root, "movie.mkv")]: "12345",
    [join(root, "shows", "season1", "ep1.MP4")]: "123",
    [join(root, "notes.txt")]: "text",
    [join(root, "shows", "poster.jpg")]: "img",
  });
  const library = seedLibrary(context.db, { path: root });
  const rows = (libraryId = library.id) =>
    context.db.select().from(files).where(eq(files.libraryId, libraryId)).all();
  return { context, root, libraryId: library.id, rows, disk };
}

describe("scanLibrary", () => {
  test("inserts media files recursively and ignores other extensions", async () => {
    const { context, root, libraryId, rows } = await setup();
    const result = await scanLibrary(context, libraryId);
    expect(result).toEqual({ created: 2, updated: 0, deleted: 0 });
    expect(
      rows()
        .map((r) => [r.path, r.size])
        .sort(),
    ).toEqual([
      [join(root, "movie.mkv"), 5],
      [join(root, "shows", "season1", "ep1.MP4"), 3],
    ]);
  });

  test("is idempotent", async () => {
    const { context, libraryId } = await setup();
    await scanLibrary(context, libraryId);
    expect(await scanLibrary(context, libraryId)).toEqual({
      created: 0,
      updated: 0,
      deleted: 0,
    });
  });

  test("re-probes and re-evaluates a changed file", async () => {
    const { context, root, libraryId, rows, disk } = await setup();
    await scanLibrary(context, libraryId);
    const path = join(root, "movie.mkv");
    context.db
      .update(files)
      .set({ status: "done", mediaInfo: null })
      .where(eq(files.path, path))
      .run();
    disk.write(path, "1234567890");
    expect(await scanLibrary(context, libraryId)).toEqual({
      created: 0,
      updated: 1,
      deleted: 0,
    });
    const row = rows().find((r) => r.path === path);
    expect(row?.size).toBe(10);
    expect(row?.mediaInfo).not.toBeNull();
    expect(row?.status).toBe("done");
  });

  test("deletes files removed from disk", async () => {
    const { context, root, libraryId, rows, disk } = await setup();
    await scanLibrary(context, libraryId);
    disk.remove(join(root, "movie.mkv"));
    expect(await scanLibrary(context, libraryId)).toEqual({
      created: 0,
      updated: 0,
      deleted: 1,
    });
    expect(rows()).toHaveLength(1);
  });

  test("does not touch other libraries", async () => {
    const { context, libraryId, rows } = await setup();
    const other = seedLibrary(context.db, { name: "other" });
    seedFile(context.db, other.id, { path: "/tmp/x.mkv" });
    await scanLibrary(context, libraryId);
    expect(rows(other.id)).toHaveLength(1);
  });

  test("rejects a missing library", async () => {
    const { context } = await setup();
    expect(scanLibrary(context, unknownId)).rejects.toThrow();
  });
});
