import { ORPCError } from "@orpc/server";
import { count, eq } from "drizzle-orm";
import { workers } from "@/db/schema";
import {
  firstOrThrow,
  hasChanges,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { generateWorkerToken, hashWorkerToken } from "@/worker/worker.lib";
import { workerOptions } from "@/worker/worker.options";

const list = orpc.workers.list.handler(({ context, input }) => {
  return toPage(
    context.db.query.workers
      .findMany({
        ...workerOptions,
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(workers).all(),
  );
});

const create = orpc.workers.create.handler(async ({ context, input }) => {
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
  const worker = orThrow(
    context.db.query.workers
      .findFirst({
        ...workerOptions,
        where: { id: created.id },
      })
      .sync(),
  );
  await context.events.publish("event", {
    resource: "worker",
    change: "created",
    id: worker.id,
  });
  return { ...worker, token };
});

const get = orpc.workers.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.workers
      .findFirst({
        ...workerOptions,
        where: { id: input.id },
      })
      .sync(),
  );
});

const update = orpc.workers.update.handler(async ({ context, input }) => {
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
    await context.events.publish("event", {
      resource: "worker",
      change: "updated",
      id,
    });
  }
  return orThrow(
    context.db.query.workers
      .findFirst({
        ...workerOptions,
        where: { id },
      })
      .sync(),
  );
});

const remove = orpc.workers.remove.handler(async ({ context, input }) => {
  firstOrThrow(
    context.db
      .delete(workers)
      .where(eq(workers.id, input.id))
      .returning({ id: workers.id })
      .all(),
  );
  await context.events.publish("event", {
    resource: "worker",
    change: "deleted",
    id: input.id,
  });
});

const regenerateToken = orpc.workers.regenerateToken.handler(
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
    await context.events.publish("event", {
      resource: "worker",
      change: "updated",
      id: input.id,
    });
    return { token };
  },
);

const jobs = orpc.workers.jobs.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const workersRouter = orpc.workers.router({
  list,
  create,
  get,
  update,
  remove,
  regenerateToken,
  jobs,
});
