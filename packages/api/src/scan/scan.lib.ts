import fs from "node:fs";
import { extname } from "node:path";
import type { FileId, JobId, LibraryId } from "@formatarr/contract";
import { and, eq, inArray } from "drizzle-orm";
import type { Context } from "@/context";
import { files } from "@/db/schema";
import { createJobsForFiles } from "@/job/job.lib";
import { orThrow } from "@/lib/db";
import { assertDirectory } from "@/library/library.lib";
import { probeFiles } from "@/probe/probe.lib";
import { cancelJobs, dispatchTasks, publishJobStatus } from "@/task/task.lib";

const MEDIA_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".m4v",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".ts",
  ".m2ts",
  ".mpg",
  ".mpeg",
]);

const DELETE_CHUNK_SIZE = 500;

type ScanContext = Pick<
  Context,
  "db" | "events" | "logger" | "env" | "probe" | "workers"
>;

export type ScanResult = { created: number; updated: number; deleted: number };

async function walkMedia(root: string) {
  const found = new Map<string, number>();
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
  })) {
    if (!MEDIA_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    found.set(path, Bun.file(path).size);
  }
  return found;
}

function sizeOnDisk(path: string) {
  return fs.statSync(path, { throwIfNoEntry: false })?.size;
}

export async function scanLibrary(
  context: ScanContext,
  libraryId: LibraryId,
): Promise<ScanResult> {
  const { db } = context;
  const library = orThrow(
    db.query.libraries.findFirst({ where: { id: libraryId } }).sync(),
  );
  await assertDirectory(library.path);
  const onDisk = await walkMedia(library.path);

  const created: FileId[] = [];
  const updated: FileId[] = [];
  const deleted: FileId[] = [];
  let cancelled: JobId[] = [];

  db.transaction((tx) => {
    const existing = tx
      .select({ id: files.id, path: files.path, size: files.size })
      .from(files)
      .where(eq(files.libraryId, libraryId))
      .all();
    const known = new Set<string>();

    for (const row of existing) {
      known.add(row.path);
      if (onDisk.get(row.path) === row.size) continue;
      const size = sizeOnDisk(row.path);
      if (size === undefined) {
        deleted.push(row.id);
      } else if (size !== row.size) {
        tx.update(files)
          .set({ size, status: "pending", mediaInfo: null })
          .where(eq(files.id, row.id))
          .run();
        updated.push(row.id);
      }
    }

    cancelled = cancelJobs(tx, updated);

    for (let start = 0; start < deleted.length; start += DELETE_CHUNK_SIZE) {
      tx.delete(files)
        .where(
          and(
            eq(files.libraryId, libraryId),
            inArray(files.id, deleted.slice(start, start + DELETE_CHUNK_SIZE)),
          ),
        )
        .run();
    }

    for (const path of onDisk.keys()) {
      if (known.has(path)) continue;
      const size = sizeOnDisk(path);
      if (size === undefined) continue;
      const row = tx
        .insert(files)
        .values({ libraryId, path, size })
        .returning({ id: files.id })
        .get();
      created.push(row.id);
    }
  });

  await publishJobStatus(context.events, cancelled, "cancelled");
  if (deleted.length > 0 || cancelled.length > 0) await dispatchTasks(context);

  await probeFiles(context, [...created, ...updated]);
  await createJobsForFiles(context, [...created, ...updated]);

  return {
    created: created.length,
    updated: updated.length,
    deleted: deleted.length,
  };
}
