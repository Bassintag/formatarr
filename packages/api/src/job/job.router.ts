import type { Job } from "@formatarr/contract";
import { count, eq, type SQL } from "drizzle-orm";
import { userAuth, workerAuth } from "@/auth/auth.middleware";
import { jobs } from "@/db/schema";
import { createJob, getJob } from "@/job/job.lib";
import { jobOptions } from "@/job/job.options";
import { openSource, receiveResult } from "@/job/transfer.lib";
import { buildWhere, firstOrThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { createLog, logs } from "@/log/log.router";
import { dispatchTasks, updateJob } from "@/task/task.lib";

const list = orpc.jobs.use(userAuth).list.handler(({ context, input }) => {
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

  const page = toPage(
    context.db.query.jobs
      .findMany({
        ...jobOptions,
        where: { RAW: where },
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(jobs).where(where(jobs)).all(),
  );
  return { ...page, items: page.items as Job[] };
});

const create = orpc.jobs.use(userAuth).create.handler(({ context, input }) => {
  return createJob(context, input.fileId);
});

const get = orpc.jobs.use(userAuth).get.handler(({ context, input }) => {
  return getJob(context.db, input.id);
});

const update = orpc.jobs
  .use(workerAuth)
  .update.handler(({ context, input }) => {
    return updateJob(context, context.worker.id, input);
  });

const source = orpc.jobs
  .use(workerAuth)
  .source.handler(({ context, input }) => {
    return openSource(context, context.worker.id, input.id);
  });

const result = orpc.jobs
  .use(workerAuth)
  .result.handler(({ context, input }) => {
    return receiveResult(context, context.worker.id, {
      id: input.params.id,
      size: input.query.size,
      body: input.body,
    });
  });

const remove = orpc.jobs
  .use(userAuth)
  .remove.handler(async ({ context, input }) => {
    firstOrThrow(
      context.db
        .delete(jobs)
        .where(eq(jobs.id, input.id))
        .returning({ id: jobs.id })
        .all(),
    );
    await dispatchTasks(context);
  });

export const jobsRouter = orpc.jobs.router({
  list,
  create,
  get,
  logs,
  createLog,
  update,
  source,
  result,
  remove,
});
