import { describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { files, type libraries } from "@/db/schema";
import { createScanScheduler } from "@/scans/scan.scheduler";
import { createTestContext } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";
import { seedLibrary, unknownId } from "@/testing/seed";
import { advance } from "@/testing/timers";

async function setup(values: Partial<typeof libraries.$inferInsert> = {}) {
  const context = createTestContext();
  const root = "/media";
  const disk = mockFileSystem({ [join(root, "movie.mkv")]: "12345" });
  const library = seedLibrary(context.db, { path: root, ...values });
  const rows = () =>
    context.db
      .select()
      .from(files)
      .where(eq(files.libraryId, library.id))
      .all();
  return { context, root, library, rows, disk };
}

describe("scan scheduler", () => {
  test("scan indexes the library and skips concurrent runs", async () => {
    const { context, library, rows } = await setup();
    const scheduler = await createScanScheduler(context);

    await Promise.all([scheduler.scan(library.id), scheduler.scan(library.id)]);

    expect(rows()).toHaveLength(1);
  });

  test("scan swallows errors for unknown libraries", async () => {
    const { context } = await setup();
    const scheduler = await createScanScheduler(context);

    expect(scheduler.scan(unknownId)).resolves.toBeUndefined();
  });

  test("watch triggers a debounced scan when files change", async () => {
    const { context, library, root, rows, disk } = await setup({ watch: true });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });

    disk.write(join(root, "other.mkv"), "123");
    disk.changed(root);
    disk.changed(root);
    await advance(49);
    expect(rows()).toHaveLength(0);
    await advance(1);

    expect(rows()).toHaveLength(2);
    scheduler.remove(library.id);
  });

  test("remove stops the watcher", async () => {
    const { context, library, root, rows, disk } = await setup({ watch: true });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });
    expect(disk.activeWatchers(root)).toBe(1);

    scheduler.remove(library.id);
    disk.changed(root);
    await advance(100);

    expect(disk.activeWatchers(root)).toBe(0);
    expect(rows()).toHaveLength(0);
  });

  test("disabled libraries are not watched", async () => {
    const { context, library, root, rows, disk } = await setup({
      watch: true,
      enabled: false,
    });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });
    await scheduler.update(library);

    expect(disk.activeWatchers(root)).toBe(0);
    disk.changed(root);
    await advance(100);

    expect(rows()).toHaveLength(0);
  });

  test("scanCron registers a cron job and remove stops it", async () => {
    const stop = { calls: 0 };
    const cronSpy = spyOn(Bun, "cron").mockImplementation((() => ({
      stop: () => {
        stop.calls += 1;
      },
      unref() {
        return this;
      },
    })) as never);
    try {
      const { context, library } = await setup({ scanCron: "*/5 * * * *" });
      const scheduler = await createScanScheduler(context);

      expect(cronSpy).toHaveBeenCalledTimes(1);
      expect(cronSpy.mock.calls[0]?.[0]).toBe("*/5 * * * *");

      scheduler.remove(library.id);
      expect(stop.calls).toBe(1);
    } finally {
      cronSpy.mockRestore();
    }
  });

  test("update replaces the previous schedule", async () => {
    const stop = { calls: 0 };
    const cronSpy = spyOn(Bun, "cron").mockImplementation((() => ({
      stop: () => {
        stop.calls += 1;
      },
      unref() {
        return this;
      },
    })) as never);
    try {
      const { context, library } = await setup({ scanCron: "*/5 * * * *" });
      const scheduler = await createScanScheduler(context);

      await scheduler.update({ ...library, scanCron: "0 * * * *" });

      expect(stop.calls).toBe(1);
      expect(cronSpy).toHaveBeenCalledTimes(2);
      scheduler.remove(library.id);
    } finally {
      cronSpy.mockRestore();
    }
  });
});
