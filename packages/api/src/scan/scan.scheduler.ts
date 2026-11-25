import fs, { type FSWatcher } from "node:fs";
import type { Library, LibraryId } from "@formatarr/contract";
import { debounce } from "es-toolkit";
import type { PrimitiveContext } from "@/context";
import { scanLibrary } from "@/scan/scan.lib";

type ScheduledLibrary = Pick<
  Library,
  "id" | "enabled" | "path" | "scanCron" | "watch"
>;

type Handle = { cron?: Bun.CronJob; watcher?: FSWatcher };

const WATCH_DEBOUNCE_MS = 5000;

export async function createScanScheduler(
  context: PrimitiveContext,
  options: { debounceMs?: number } = {},
) {
  const { debounceMs = WATCH_DEBOUNCE_MS } = options;
  const scanning = new Set<LibraryId>();
  const handles = new Map<LibraryId, Handle>();

  async function scan(libraryId: LibraryId) {
    if (scanning.has(libraryId)) return;
    scanning.add(libraryId);
    try {
      await scanLibrary(context, libraryId);
    } catch (err) {
      context.logger.error({ err, libraryId }, "scan failed");
    } finally {
      scanning.delete(libraryId);
    }
  }

  async function update(library: ScheduledLibrary) {
    remove(library.id);
    if (!library.enabled) return;
    const handle: Handle = {};
    handles.set(library.id, handle);
    try {
      if (library.scanCron) {
        handle.cron = Bun.cron(library.scanCron, () =>
          scan(library.id),
        ).unref();
      }
      if (library.watch) {
        const callback = debounce(() => scan(library.id), debounceMs);
        handle.watcher = fs
          .watch(library.path, { recursive: true }, callback)
          .on("close", callback.cancel)
          .on("error", (err) => {
            context.logger.error(
              { err, libraryId: library.id },
              "watcher failed",
            );
            remove(library.id);
          })
          .unref();
      }
    } catch (err) {
      remove(library.id);
      context.logger.error(
        { err, libraryId: library.id },
        "scan schedule failed",
      );
    }
  }

  function remove(libraryId: LibraryId) {
    const handle = handles.get(libraryId);
    if (!handle) return;
    if (handle.cron) handle.cron.stop();
    if (handle.watcher) handle.watcher.close();
    handles.delete(libraryId);
  }

  const enabledLibraries = context.db.query.libraries
    .findMany({
      columns: {
        id: true,
        enabled: true,
        path: true,
        scanCron: true,
        watch: true,
      },
      where: { enabled: true },
    })
    .sync();
  await Promise.all(enabledLibraries.map(update));

  return { scan, update, remove };
}

export type ScanScheduler = Awaited<ReturnType<typeof createScanScheduler>>;
