import { join, parse } from "node:path";
import type {
  Job,
  JobId,
  JobStatus,
  JobUpdate,
  WorkerId,
} from "@formatarr/contract";
import { and, eq, inArray } from "drizzle-orm";
import type { Context } from "@/context";
import { files, jobs } from "@/db/schema";
import { getJob } from "@/job/job.lib";
import { firstOrThrow, type Tx } from "@/lib/db";
import { MAX_RUNNING_JOBS } from "@/worker/worker.options";

type TaskContext = Pick<Context, "db" | "events" | "workers">;

export async function publishJobStatus(
  events: Context["events"],
  ids: JobId[],
  status: JobStatus,
) {
  for (const id of ids) {
    await events.publish("event", { type: "job.status", id, status });
  }
}

// TODO: replace once files are transferred over the network
function temporaryOutputPath(sourcePath: string, rules: Job["rules"]) {
  const { dir, name, ext } = parse(sourcePath);
  const container = rules.find((rule) => rule.type === "container");
  const extension = container ? `.${container.value}` : ext;
  return join(dir, `${name}.formatarr${extension}`);
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
        with: { file: { columns: { path: true, mediaInfo: true } } },
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
    const { path, mediaInfo } = next.file;
    tx.update(jobs)
      .set({ status: "running", workerId, startedAt: new Date() })
      .where(eq(jobs.id, next.id))
      .run();
    tx.update(files)
      .set({ status: "processing" })
      .where(eq(files.id, next.fileId))
      .run();
    const job = getJob(tx, next.id);
    return {
      job,
      sourcePath: path,
      outputPath: temporaryOutputPath(path, job.rules),
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

export async function updateJob(
  context: TaskContext,
  workerId: WorkerId,
  { id, ...changes }: JobUpdate,
) {
  const { status } = changes;
  context.db.transaction((tx) => {
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
  });
  if (status) {
    await publishJobStatus(context.events, [id], status);
    await dispatchTasks(context);
  } else {
    await context.events.publish("event", {
      type: "job.progress",
      id,
      progress: changes.progress,
    });
  }
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
