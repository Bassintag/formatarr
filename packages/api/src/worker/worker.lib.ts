import { randomBytes } from "node:crypto";
import type { WorkerId, WorkerStatus } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { Context } from "@/context";
import { workers } from "@/db/schema";
import { orThrow, type Tx } from "@/lib/db";
import { dispatchTasks, publishJobStatus, requeueJobs } from "@/task/task.lib";
import { workerOptions } from "@/worker/worker.options";

const TOKEN_PREFIX = "fmw_";

type WorkerContext = Pick<Context, "db" | "events" | "workers">;

export function generateWorkerToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashWorkerToken(token: string) {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export function withStatus<T extends { id: WorkerId }>(
  context: Pick<Context, "workers">,
  worker: T,
) {
  const status: WorkerStatus = context.workers.isConnected(worker.id)
    ? "online"
    : "offline";
  return { ...worker, status };
}

export function findWorker(
  context: Pick<Context, "db" | "workers">,
  id: WorkerId,
) {
  const worker = orThrow(
    context.db.query.workers
      .findFirst({ ...workerOptions, where: { id } })
      .sync(),
  );
  return withStatus(context, worker);
}

function touchWorker(db: Context["db"] | Tx, id: WorkerId) {
  db.update(workers)
    .set({ lastSeenAt: new Date() })
    .where(eq(workers.id, id))
    .run();
}

export async function connectWorker(
  context: WorkerContext,
  id: WorkerId,
  signal?: AbortSignal,
) {
  const messages = context.workers.connect(id, signal);
  if (!messages) throw new ORPCError("CONFLICT");
  touchWorker(context.db, id);
  await context.events.publish("event", { type: "worker.connected", id });
  return messages;
}

export async function disconnectWorker(context: WorkerContext, id: WorkerId) {
  context.workers.disconnect(id);
  const requeued = context.db.transaction((tx) => {
    touchWorker(tx, id);
    return requeueJobs(tx, id);
  });
  await publishJobStatus(
    context.events,
    requeued.map((job) => job.id),
    "queued",
  );
  await context.events.publish("event", { type: "worker.disconnected", id });
  await dispatchTasks(context);
}
