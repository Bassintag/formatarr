import { basename } from "node:path";
import type {
  FileId,
  JobId,
  JobStatus,
  JobUpdate,
  WorkerId,
} from "@formatarr/contract";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Context } from "@/context";
import { files, jobs, workers } from "@/db/schema";
import { getJob, JOB_CHUNK_SIZE } from "@/job/job.lib";
import { firstOrThrow, type Tx } from "@/lib/db";
import { appendJobLog } from "@/log/log.lib";
import { touchWorker } from "@/worker/worker.lib";
import { MAX_RUNNING_JOBS } from "@/worker/worker.options";

type TaskContext = Pick<Context, "db" | "events" | "workers">;

type JobChanges = Pick<JobUpdate, "id" | "progress"> & {
  status?: Extract<JobStatus, "succeeded">;
};

type Interruption = {
  reason: string;
  maxRetries: number;
  workerId?: WorkerId;
  id?: JobId;
};

export async function publishJobStatus(
  events: Context["events"],
  ids: JobId[],
  status: JobStatus,
) {
  for (const id of ids) {
    await events.publish("event", { type: "job.status", id, status });
  }
}

export async function publishInterrupted(
  events: Context["events"],
  interrupted: { id: JobId; status: JobStatus }[],
) {
  for (const { id, status } of interrupted) {
    await publishJobStatus(events, [id], status);
  }
}

export function claimTask(db: Context["db"], workerId: WorkerId) {
  return db.transaction((tx) => {
    const worker = tx.query.workers
      .findFirst({
        columns: { id: true, name: true },
        with: { runningJobs: { columns: { id: true } } },
        where: { id: workerId, enabled: true },
      })
      .sync();
    if (!worker || worker.runningJobs.length >= MAX_RUNNING_JOBS) return;
    const next = tx.query.jobs
      .findFirst({
        columns: { id: true, fileId: true, attempts: true },
        with: {
          file: { columns: { path: true, size: true, mediaInfo: true } },
        },
        where: {
          status: "queued",
          file: {
            ignored: false,
            mediaInfo: { isNotNull: true },
            library: { enabled: true },
          },
        },
        orderBy: { id: "asc" },
      })
      .sync();
    if (!next?.file?.mediaInfo) return;
    const { path, size, mediaInfo } = next.file;
    const attempts = next.attempts + 1;
    tx.update(jobs)
      .set({ status: "running", workerId, attempts, startedAt: new Date() })
      .where(eq(jobs.id, next.id))
      .run();
    appendJobLog(
      tx,
      next.id,
      `Attempt ${attempts} started on worker ${worker.name}`,
    );
    tx.update(files)
      .set({ status: "processing" })
      .where(eq(files.id, next.fileId))
      .run();
    return {
      job: getJob(tx, next.id),
      fileName: basename(path),
      size,
      mediaInfo,
    };
  });
}

export async function dispatchTasks(context: TaskContext) {
  const tasks = context.workers.dispatch((id) => claimTask(context.db, id));
  await publishJobStatus(
    context.events,
    tasks.map((task) => task.job.id),
    "running",
  );
}

export function applyJobChanges(
  tx: Tx,
  workerId: WorkerId,
  { id, ...changes }: JobChanges,
) {
  const { status } = changes;
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
  appendJobLog(tx, id, "Succeeded");
  tx.update(files)
    .set({ status: "done" })
    .where(and(eq(files.id, job.fileId), eq(files.status, "processing")))
    .run();
}

export async function announceJob(
  context: TaskContext,
  id: JobId,
  status: JobStatus,
) {
  await publishJobStatus(context.events, [id], status);
  await dispatchTasks(context);
}

export async function updateJob(
  context: TaskContext & Pick<Context, "settings">,
  workerId: WorkerId,
  { id, progress, status, error = "Failed" }: JobUpdate,
) {
  const { maxRetries } = (await context.settings.read()).jobs;
  const interrupted = context.db.transaction((tx) => {
    applyJobChanges(tx, workerId, { id, progress });
    touchWorker(tx, workerId);
    if (!status) return;
    return interruptJobs(tx, { id, reason: error, maxRetries });
  });
  if (interrupted) {
    await publishInterrupted(context.events, interrupted);
    await dispatchTasks(context);
  } else {
    await context.events.publish("event", {
      type: "job.progress",
      id,
      progress,
    });
  }
  return getJob(context.db, id);
}

export function interruptJobs(
  tx: Tx,
  { reason, maxRetries, workerId, id }: Interruption,
) {
  const running = tx
    .select({ id: jobs.id, fileId: jobs.fileId, attempts: jobs.attempts })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "running"),
        workerId ? eq(jobs.workerId, workerId) : undefined,
        id ? eq(jobs.id, id) : undefined,
      ),
    )
    .all();
  return running.map((job) => {
    const status: Extract<JobStatus, "queued" | "failed"> =
      job.attempts > maxRetries ? "failed" : "queued";
    tx.update(jobs)
      .set(
        status === "failed"
          ? { status, error: reason, finishedAt: new Date() }
          : {
              status,
              workerId: null,
              progress: 0,
              error: null,
              startedAt: null,
            },
      )
      .where(eq(jobs.id, job.id))
      .run();
    tx.update(files)
      .set({ status })
      .where(and(eq(files.id, job.fileId), eq(files.status, "processing")))
      .run();
    appendJobLog(tx, job.id, reason);
    return { id: job.id, status };
  });
}

export async function expireJobs(
  context: TaskContext & Pick<Context, "settings">,
) {
  const { maxRetries, timeoutSeconds } = (await context.settings.read()).jobs;
  const deadline = new Date(Date.now() - timeoutSeconds * 1000);
  const expired = context.db.transaction((tx) =>
    tx
      .select({ id: jobs.id, workerId: workers.id })
      .from(jobs)
      .innerJoin(workers, eq(jobs.workerId, workers.id))
      .where(
        and(
          eq(jobs.status, "running"),
          lt(jobs.startedAt, deadline),
          lt(workers.lastSeenAt, deadline),
        ),
      )
      .all()
      .map((job) => ({
        workerId: job.workerId,
        interrupted: interruptJobs(tx, {
          id: job.id,
          reason: "Timed out",
          maxRetries,
        }),
      })),
  );
  if (expired.length === 0) return;
  for (const { workerId } of expired) {
    context.workers.disconnect(workerId);
    await context.workers.close(workerId);
  }
  await publishInterrupted(
    context.events,
    expired.flatMap((job) => job.interrupted),
  );
  await dispatchTasks(context);
}

export function cancelJobs(tx: Tx, fileIds: FileId[]) {
  const cancelled: JobId[] = [];
  for (let start = 0; start < fileIds.length; start += JOB_CHUNK_SIZE) {
    const chunk = tx
      .update(jobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(
        and(
          inArray(jobs.fileId, fileIds.slice(start, start + JOB_CHUNK_SIZE)),
          inArray(jobs.status, ["queued", "running"]),
        ),
      )
      .returning({ id: jobs.id })
      .all();
    cancelled.push(...chunk.map((job) => job.id));
  }
  return cancelled;
}
