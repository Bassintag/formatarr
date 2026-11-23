import { ORPCError } from "@orpc/server";
import { count, eq } from "drizzle-orm";
import { workers } from "@/db/schema";
import { firstOrThrow, orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { generateWorkerToken, hashWorkerToken } from "@/workers/worker.lib";
import { workerOptions } from "./worker.options";

const list = orpc.workers.list.handler(async ({ context, input }) => {
  return toPage(
    context.db.query.workers.findMany({
      ...workerOptions,
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(workers),
  );
});

const create = orpc.workers.create.handler(async ({ context, input }) => {
  const token = generateWorkerToken();
  const created = await firstOrThrow(
    context.db
      .insert(workers)
      .values({
        name: input.name,
        capabilities: input.capabilities,
        tokenHash: hashWorkerToken(token),
      })
      .returning({ id: workers.id }),
  );
  const worker = await orThrow(
    context.db.query.workers.findFirst({
      ...workerOptions,
      where: { id: created.id },
    }),
  );
  return { ...worker, token };
});

const get = orpc.workers.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.workers.findFirst({
      ...workerOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.workers.update.handler(async ({ context, input }) => {
  const { id, ...changes } = input;
  if (Object.values(changes).some((value) => value !== undefined)) {
    await firstOrThrow(
      context.db
        .update(workers)
        .set(changes)
        .where(eq(workers.id, id))
        .returning({ id: workers.id }),
    );
  }
  return orThrow(
    context.db.query.workers.findFirst({
      ...workerOptions,
      where: { id },
    }),
  );
});

const remove = orpc.workers.remove.handler(async ({ context, input }) => {
  await firstOrThrow(
    context.db
      .delete(workers)
      .where(eq(workers.id, input.id))
      .returning({ id: workers.id }),
  );
});

const regenerateToken = orpc.workers.regenerateToken.handler(
  async ({ context, input }) => {
    const token = generateWorkerToken();
    await firstOrThrow(
      context.db
        .update(workers)
        .set({ tokenHash: hashWorkerToken(token) })
        .where(eq(workers.id, input.id))
        .returning({ id: workers.id }),
    );
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
