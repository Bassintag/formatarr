import type { FileId, JobId, JobUpdate, WorkerId } from "@formatarr/contract";
import { and, eq, inArray } from "drizzle-orm";
import type { Context } from "@/context";
import { files, jobs } from "@/db/schema";
import { getJob } from "@/job/job.lib";
import { firstOrThrow, type Tx } from "@/lib/db";
import { MAX_RUNNING_JOBS } from "@/worker/worker.options";

type TaskContext = Pick<Context, "db" | "events" | "workers">;

export async function publishJobUpdates(
  events: Context["events"],
  rows: { id: JobId; fileId?: FileId }[],
) {
  for (const { id, fileId } of rows) {
    await events.publish("event", { resource: "job", change: "updated", id });
    if (!fileId) continue;
    await events.publish("event", {
      resource: "file",
      change: "updated",
      id: fileId,
    });
  }
}

export function claimTask(db: Context["db"], workerId: WorkerId) {
  return db.transaction((tx) => {
    const worker = tx.query.workers
      .findFirst({
        columns: { id: true },
        with: { runningJobs: { columns: { id: true } } },
        where: { id: workerId, enabled: true },
      })
      .sync();
    if (!worker || worker.runningJobs.length >= MAX_RUNNING_JOBS) return;
    const next = tx.query.jobs
      .findFirst({
        columns: { id: true, fileId: true },
        with: { file: { columns: { path: true } } },
        where: {
          status: "queued",
          file: { ignored: false, library: { enabled: true } },
        },
        orderBy: { id: "asc" },
      })
      .sync();
    if (!next?.file) return;
    tx.update(jobs)
      .set({ status: "running", workerId, startedAt: new Date() })
      .where(eq(jobs.id, next.id))
      .run();
    tx.update(files)
      .set({ status: "processing" })
      .where(eq(files.id, next.fileId))
      .run();
    return { job: getJob(tx, next.id), sourcePath: next.file.path };
  });
}

export async function dispatchTasks(context: TaskContext) {
  const tasks = context.workers.dispatch((id) => claimTask(context.db, id));
  await publishJobUpdates(
    context.events,
    tasks.map((task) => task.job),
  );
}

export async function updateJob(
  context: TaskContext,
  workerId: WorkerId,
  { id, ...changes }: JobUpdate,
) {
  const { status } = changes;
  const fileId = context.db.transaction((tx) => {
    const job = firstOrThrow(
      tx
        .update(jobs)
        .set({ ...changes, finishedAt: status && new Date() })
        .where(
          and(
            eq(jobs.id, id),
            eq(jobs.workerId, workerId),
            eq(jobs.status, "running"),
          ),
        )
        .returning({ fileId: jobs.fileId })
        .all(),
    );
    if (!status) return;
    tx.update(files)
      .set({ status: status === "succeeded" ? "done" : "failed" })
      .where(and(eq(files.id, job.fileId), eq(files.status, "processing")))
      .run();
    return job.fileId;
  });
  await publishJobUpdates(context.events, [{ id, fileId }]);
  if (status) await dispatchTasks(context);
  return getJob(context.db, id);
}

export function requeueJobs(tx: Tx, workerId?: WorkerId) {
  const requeued = tx
    .update(jobs)
    .set({
      status: "queued",
      workerId: null,
      progress: 0,
      error: null,
      startedAt: null,
    })
    .where(
      and(
        eq(jobs.status, "running"),
        workerId ? eq(jobs.workerId, workerId) : undefined,
      ),
    )
    .returning({ id: jobs.id, fileId: jobs.fileId })
    .all();
  tx.update(files)
    .set({ status: "queued" })
    .where(
      and(
        inArray(
          files.id,
          requeued.map((job) => job.fileId),
        ),
        eq(files.status, "processing"),
      ),
    )
    .run();
  return requeued;
}
