import type { Job } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { count, eq, type SQL } from "drizzle-orm";
import { jobs } from "@/db/schema";
import { jobOptions } from "@/job/job.options";
import {
  buildWhere,
  firstOrThrow,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";

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
    return buildWhere(conditions);
  }

  const page = await toPage(
    context.db.query.jobs.findMany({
      ...jobOptions,
      where: { RAW: where },
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(jobs).where(where(jobs)),
  );
  return { ...page, items: page.items as Job[] };
});

const create = orpc.jobs.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.jobs.get.handler(
  async ({ context, input }) =>
    (await orThrow(
      context.db.query.jobs.findFirst({
        ...jobOptions,
        where: { id: input.id },
      }),
    )) as Job,
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
  await context.events.publish("event", {
    resource: "job",
    change: "deleted",
    id: input.id,
  });
});

export const jobsRouter = orpc.jobs.router({
  list,
  create,
  get,
  update,
  remove,
});
