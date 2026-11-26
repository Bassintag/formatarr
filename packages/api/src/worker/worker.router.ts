import { count, eq } from "drizzle-orm";
import { userAuth } from "@/auth/auth.middleware";
import { workers } from "@/db/schema";
import { firstOrThrow, hasChanges, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { dispatchTasks, publishJobStatus, requeueJobs } from "@/task/task.lib";
import {
  findWorker,
  generateWorkerToken,
  hashWorkerToken,
  withStatus,
} from "@/worker/worker.lib";
import { workerOptions } from "@/worker/worker.options";

const userWorkers = orpc.workers.use(userAuth);

const list = userWorkers.list.handler(({ context, input }) => {
  const page = toPage(
    context.db.query.workers
      .findMany({
        ...workerOptions,
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(workers).all(),
  );
  return {
    ...page,
    items: page.items.map((worker) => withStatus(context, worker)),
  };
});

const create = userWorkers.create.handler(({ context, input }) => {
  const token = generateWorkerToken();
  const created = firstOrThrow(
    context.db
      .insert(workers)
      .values({
        name: input.name,
        capabilities: input.capabilities,
        tokenHash: hashWorkerToken(token),
      })
      .returning({ id: workers.id })
      .all(),
  );
  return { ...findWorker(context, created.id), token };
});

const get = userWorkers.get.handler(({ context, input }) => {
  return findWorker(context, input.id);
});

const update = userWorkers.update.handler(async ({ context, input }) => {
  const { id, ...changes } = input;
  if (hasChanges(changes)) {
    firstOrThrow(
      context.db
        .update(workers)
        .set(changes)
        .where(eq(workers.id, id))
        .returning({ id: workers.id })
        .all(),
    );
    if (changes.enabled === false) await context.workers.close(id);
  }
  return findWorker(context, id);
});

const remove = userWorkers.remove.handler(async ({ context, input }) => {
  const requeued = context.db.transaction((tx) => {
    const requeued = requeueJobs(tx, input.id);
    firstOrThrow(
      tx
        .delete(workers)
        .where(eq(workers.id, input.id))
        .returning({ id: workers.id })
        .all(),
    );
    return requeued;
  });
  await context.workers.close(input.id);
  await publishJobStatus(
    context.events,
    requeued.map((job) => job.id),
    "queued",
  );
  if (requeued.length > 0) await dispatchTasks(context);
});

const regenerateToken = userWorkers.regenerateToken.handler(
  async ({ context, input }) => {
    const token = generateWorkerToken();
    firstOrThrow(
      context.db
        .update(workers)
        .set({ tokenHash: hashWorkerToken(token) })
        .where(eq(workers.id, input.id))
        .returning({ id: workers.id })
        .all(),
    );
    await context.workers.close(input.id);
    return { token };
  },
);

export const workersRouter = orpc.workers.router({
  list,
  create,
  get,
  update,
  remove,
  regenerateToken,
});
