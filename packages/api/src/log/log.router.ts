import { userAuth, workerAuth } from "@/auth/auth.middleware";
import { getJob } from "@/job/job.lib";
import { orThrow } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { appendJobLog, listJobLogs } from "@/log/log.lib";

export const logs = orpc.jobs
  .use(userAuth)
  .logs.handler(({ context, input }) => {
    getJob(context.db, input.id);
    return listJobLogs(context.db, input.id);
  });

export const createLog = orpc.jobs
  .use(workerAuth)
  .createLog.handler(({ context, input }) => {
    orThrow(
      context.db.query.jobs
        .findFirst({
          columns: { id: true },
          where: {
            id: input.id,
            workerId: context.worker.id,
            status: "running",
          },
        })
        .sync(),
    );
    return appendJobLog(context.db, input.id, input.message);
  });
