import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { files, libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { scanLibrary } from "@/scans/scans.lib";
import { createTestContext } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";

async function setup() {
  const context = createTestContext();
  const root = "/media";
  const disk = mockFileSystem({
    [join(root, "movie.mkv")]: "12345",
    [join(root, "shows", "season1", "ep1.MP4")]: "123",
    [join(root, "notes.txt")]: "text",
    [join(root, "shows", "poster.jpg")]: "img",
  });
  const library = await firstOrThrow(
    context.db
      .insert(libraries)
      .values({ name: "lib", path: root })
      .returning({ id: libraries.id }),
  );
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

  test("resets a changed file to pending", async () => {
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
    expect(row?.status).toBe("pending");
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
    const other = await firstOrThrow(
      context.db
        .insert(libraries)
        .values({ name: "other", path: "/tmp" })
        .returning({ id: libraries.id }),
    );
    context.db
      .insert(files)
      .values({ libraryId: other.id, path: "/tmp/x.mkv", size: 1 })
      .run();
    await scanLibrary(context, libraryId);
    expect(rows(other.id)).toHaveLength(1);
  });

  test("rejects a missing library", async () => {
    const { context } = await setup();
    expect(scanLibrary(context, 999 as never)).rejects.toThrow();
  });
});
