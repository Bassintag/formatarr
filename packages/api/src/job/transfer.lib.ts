import { randomUUID } from "node:crypto";
import { statSync, unlinkSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JobId, MediaInfo, WorkerId } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { Context } from "@/context";
import { files } from "@/db/schema";
import { rescanIntegrations } from "@/integration/arr.lib";
import { getJob } from "@/job/job.lib";
import {
  placeResult,
  preparePartial,
  probeResult,
  targetPath,
} from "@/job/replace.lib";
import { orThrow, type Tx } from "@/lib/db";
import { announceJob, applyJobChanges } from "@/task/task.lib";

type TransferContext = Pick<
  Context,
  "db" | "events" | "logger" | "probe" | "workers"
>;

type Result = {
  id: JobId;
  startedAt: Date | null;
  partial: string;
  size: number;
  mediaInfo: MediaInfo;
};

function runningJob(db: Context["db"] | Tx, workerId: WorkerId, id: JobId) {
  const job = orThrow(
    db.query.jobs
      .findFirst({
        columns: { startedAt: true },
        with: {
          file: {
            columns: {
              id: true,
              libraryId: true,
              path: true,
              size: true,
              mediaInfo: true,
            },
          },
        },
        where: { id, workerId, status: "running" },
      })
      .sync(),
  );
  return { startedAt: job.startedAt, file: orThrow(job.file) };
}

export async function openSource(
  context: Pick<Context, "db">,
  workerId: WorkerId,
  id: JobId,
) {
  const { file } = runningJob(context.db, workerId, id);
  const source = Bun.file(file.path);
  if (!(await source.exists())) throw new ORPCError("NOT_FOUND");
  return source.stream();
}

function replaceSource(
  { db, logger }: Pick<Context, "db" | "logger">,
  workerId: WorkerId,
  { id, startedAt, partial, size, mediaInfo }: Result,
) {
  const { source, target } = db.transaction((tx) => {
    const job = runningJob(tx, workerId, id);
    if (job.startedAt?.getTime() !== startedAt?.getTime()) {
      throw new ORPCError("NOT_FOUND");
    }
    const { file } = job;
    if (statSync(file.path, { throwIfNoEntry: false })?.size !== file.size) {
      throw new ORPCError("CONFLICT", { message: "Source file changed" });
    }
    const target = targetPath(
      file.path,
      orThrow(file.mediaInfo).container,
      mediaInfo.container,
    );
    const occupant =
      target !== file.path &&
      tx.query.files
        .findFirst({
          columns: { id: true },
          where: { libraryId: file.libraryId, path: target },
        })
        .sync();
    if (occupant) {
      throw new ORPCError("CONFLICT", {
        message: "Target file already exists",
      });
    }
    applyJobChanges(tx, workerId, { id, progress: 100, status: "succeeded" });
    tx.update(files)
      .set({ path: target, size, mediaInfo, status: "done" })
      .where(eq(files.id, file.id))
      .run();
    placeResult(partial, file.path, target);
    return { source: file.path, target };
  });
  if (target === source) return;
  try {
    unlinkSync(source);
  } catch (error) {
    logger.error({ err: error, path: source }, "original removal failed");
  }
}

export async function receiveResult(
  context: TransferContext,
  workerId: WorkerId,
  {
    id,
    size,
    body,
  }: { id: JobId; size: number; body: ReadableStream<Uint8Array> },
) {
  const { startedAt, file } = runningJob(context.db, workerId, id);
  const partial = join(
    dirname(file.path),
    `.formatarr-${id}-${randomUUID()}.part`,
  );
  try {
    await writeFile(partial, body);
    if (Bun.file(partial).size !== size) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Uploaded size does not match",
      });
    }
    const mediaInfo = await probeResult(context.probe, partial);
    await preparePartial(file.path, partial);
    replaceSource(context, workerId, {
      id,
      startedAt,
      partial,
      size,
      mediaInfo,
    });
  } finally {
    await rm(partial, { force: true });
  }
  await announceJob(context, id, "succeeded");
  rescanIntegrations(context, id, file).catch((err) =>
    context.logger.error({ err, jobId: id }, "rescan failed"),
  );
  return getJob(context.db, id);
}
