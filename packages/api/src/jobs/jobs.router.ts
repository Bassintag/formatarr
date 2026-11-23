import { ORPCError } from "@orpc/server";
import { and, count, eq, type SQL, sql } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { firstOrThrow, orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { jobOptions } from "./job.options";

const list = orpc.jobs.list.handler(async ({ context, input }) => {
  function where(table: typeof jobs) {
    const conditions: SQL[] = [];
    if (input.status) {
      conditions.push(eq(table.status, input.status));
    }
    if (input.workerId) {
      conditions.push(eq(table.workerId, input.workerId));
    }
    if (input.fileId) {
      conditions.push(eq(table.fileId, input.fileId));
    }
    return and(...conditions) ?? sql`true`;
  }

  return toPage(
    context.db.query.jobs.findMany({
      ...jobOptions,
      where: { RAW: where },
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(jobs).where(where(jobs)),
  );
});

const create = orpc.jobs.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.jobs.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.jobs.findFirst({
      ...jobOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.jobs.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const remove = orpc.jobs.remove.handler(async ({ context, input }) => {
  await firstOrThrow(
    context.db
      .delete(jobs)
      .where(eq(jobs.id, input.id))
      .returning({ id: jobs.id }),
  );
});

export const jobsRouter = orpc.jobs.router({
  list,
  create,
  get,
  update,
  remove,
});
