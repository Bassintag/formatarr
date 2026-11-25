import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { files, libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestContext } from "@/testing/harness";
import { createScanScheduler } from "./scan.scheduler";

async function setup(values: Partial<typeof libraries.$inferInsert> = {}) {
  const context = createTestContext();
  const root = mkdtempSync(join(tmpdir(), "formatarr-sched-"));
  await Bun.write(join(root, "movie.mkv"), "12345");
  const library = await firstOrThrow(
    context.db
      .insert(libraries)
      .values({ name: "lib", path: root, ...values })
      .returning(),
  );
  const rows = () =>
    context.db
      .select()
      .from(files)
      .where(eq(files.libraryId, library.id))
      .all();
  return { context, root, library, rows };
}

async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("timeout");
    await Bun.sleep(20);
  }
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

    expect(scheduler.scan(999 as never)).resolves.toBeUndefined();
  });

  test("watch triggers a scan when files change", async () => {
    const { context, library, root, rows } = await setup({ watch: true });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });

    await Bun.write(join(root, "other.mkv"), "123");

    await waitFor(() => rows().length === 2);
    scheduler.remove(library.id);
  });

  test("remove stops the watcher", async () => {
    const { context, library, root, rows } = await setup({ watch: true });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });

    scheduler.remove(library.id);
    await Bun.write(join(root, "other.mkv"), "123");
    await Bun.sleep(300);

    expect(rows()).toHaveLength(0);
  });

  test("disabled libraries are not watched", async () => {
    const { context, library, root, rows } = await setup({
      watch: true,
      enabled: false,
    });
    const scheduler = await createScanScheduler(context, { debounceMs: 50 });
    await scheduler.update(library);

    await Bun.write(join(root, "other.mkv"), "123");
    await Bun.sleep(300);

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
