import type {
  FileId,
  Job,
  JobId,
  LibraryId,
  MediaInfo,
  RuleId,
  RuleValue,
} from "@formatarr/contract";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Context } from "@/context";
import { files, jobRules, jobs, rules as rulesTable } from "@/db/schema";
import { jobOptions } from "@/job/job.options";
import { orThrow, type Tx } from "@/lib/db";
import { findUnmetRules } from "@/rules/rule.lib";
import { dispatchTasks, publishJobStatus } from "@/task/task.lib";

export const JOB_CHUNK_SIZE = 500;

export function getJob(db: Context["db"] | Tx, id: JobId) {
  return orThrow(
    db.query.jobs.findFirst({ ...jobOptions, where: { id } }).sync(),
  ) as Job;
}

export function evaluableFiles(table: typeof files, libraryId: LibraryId) {
  return and(
    eq(table.libraryId, libraryId),
    inArray(table.status, ["pending", "done"]),
    eq(table.ignored, false),
    isNotNull(table.mediaInfo),
  );
}

export async function createJobsForFiles(
  context: Pick<Context, "db" | "events" | "logger" | "workers">,
  ids: FileId[],
) {
  const { db, events } = context;
  const createdJobs: JobId[] = [];
  const rulesByLibrary = new Map<LibraryId, (RuleValue & { id: RuleId })[]>();

  db.transaction((tx) => {
    for (let start = 0; start < ids.length; start += JOB_CHUNK_SIZE) {
      const candidates = tx
        .select({
          id: files.id,
          libraryId: files.libraryId,
          mediaInfo: files.mediaInfo,
        })
        .from(files)
        .where(
          and(
            inArray(files.id, ids.slice(start, start + JOB_CHUNK_SIZE)),
            eq(files.status, "pending"),
            eq(files.ignored, false),
            isNotNull(files.mediaInfo),
          ),
        )
        .all();

      for (const file of candidates) {
        let rules = rulesByLibrary.get(file.libraryId);
        if (!rules) {
          rules = tx
            .select({
              id: rulesTable.id,
              type: rulesTable.type,
              value: rulesTable.value,
            })
            .from(rulesTable)
            .where(
              and(
                eq(rulesTable.libraryId, file.libraryId),
                eq(rulesTable.enabled, true),
              ),
            )
            .orderBy(asc(rulesTable.id))
            .all() as (RuleValue & { id: RuleId })[];
          rulesByLibrary.set(file.libraryId, rules);
        }
        const unmet = findUnmetRules(rules, file.mediaInfo as MediaInfo);
        if (unmet.length === 0) {
          tx.update(files)
            .set({ status: "done" })
            .where(eq(files.id, file.id))
            .run();
          continue;
        }
        const job = tx
          .insert(jobs)
          .values({ fileId: file.id })
          .returning({ id: jobs.id })
          .get();
        tx.insert(jobRules)
          .values(unmet.map((rule) => ({ jobId: job.id, ruleId: rule.id })))
          .run();
        tx.update(files)
          .set({ status: "queued" })
          .where(eq(files.id, file.id))
          .run();
        createdJobs.push(job.id);
      }
    }
  });

  await publishJobStatus(events, createdJobs, "queued");
  if (createdJobs.length > 0) await dispatchTasks(context);

  return createdJobs.length;
}

export async function reevaluateLibrary(
  context: Pick<Context, "db" | "events" | "logger" | "workers">,
  libraryId: LibraryId,
) {
  const ids = context.db.transaction((tx) => {
    const candidates = tx
      .select({ id: files.id, status: files.status })
      .from(files)
      .where(evaluableFiles(files, libraryId))
      .all();
    const reset = candidates
      .filter((file) => file.status === "done")
      .map((file) => file.id);
    for (let start = 0; start < reset.length; start += JOB_CHUNK_SIZE) {
      tx.update(files)
        .set({ status: "pending" })
        .where(inArray(files.id, reset.slice(start, start + JOB_CHUNK_SIZE)))
        .run();
    }
    return candidates.map((file) => file.id);
  });

  return createJobsForFiles(context, ids);
}
