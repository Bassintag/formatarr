import type { JobId } from "@formatarr/contract";
import { asc, eq } from "drizzle-orm";
import type { Context } from "@/context";
import { jobLogs } from "@/db/schema";
import type { Tx } from "@/lib/db";

const columns = { message: jobLogs.message, createdAt: jobLogs.createdAt };

export function appendJobLog(
  db: Context["db"] | Tx,
  jobId: JobId,
  message: string,
) {
  return db.insert(jobLogs).values({ jobId, message }).returning(columns).get();
}

export function listJobLogs(db: Context["db"], jobId: JobId) {
  return db
    .select(columns)
    .from(jobLogs)
    .where(eq(jobLogs.jobId, jobId))
    .orderBy(asc(jobLogs.id))
    .all();
}
