import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { JobId, WorkerId } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import type { Context } from "@/context";
import { orThrow } from "@/lib/db";
import { updateJob } from "@/task/task.lib";

type TransferContext = Pick<Context, "db" | "events" | "workers">;

function runningSourcePath(db: Context["db"], workerId: WorkerId, id: JobId) {
  const job = orThrow(
    db.query.jobs
      .findFirst({
        columns: { id: true },
        with: { file: { columns: { path: true } } },
        where: { id, workerId, status: "running" },
      })
      .sync(),
  );
  return orThrow(job.file).path;
}

export async function openSource(
  context: Pick<Context, "db">,
  workerId: WorkerId,
  id: JobId,
) {
  const source = Bun.file(runningSourcePath(context.db, workerId, id));
  if (!(await source.exists())) throw new ORPCError("NOT_FOUND");
  return source.stream();
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
  const source = runningSourcePath(context.db, workerId, id);
  const partial = join(
    dirname(source),
    `.formatarr-${id}-${randomUUID()}.part`,
  );
  try {
    await writeFile(partial, body);
    if (Bun.file(partial).size !== size) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Uploaded size does not match",
      });
    }
    return await updateJob(context, workerId, {
      id,
      progress: 100,
      status: "succeeded",
    });
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
