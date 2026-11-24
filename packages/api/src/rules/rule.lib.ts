import type {
  Condition,
  ConditionField,
  FileId,
  JobId,
  LibraryId,
  MediaInfo,
  Rule,
  RuleId,
  Scalar,
} from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Context } from "@/context";
import { files, jobs, libraries, rules as rulesTable } from "@/db/schema";
import type { Tx } from "@/lib/db";

export function assertLibraryExists(tx: Tx, libraryId: LibraryId) {
  const found = tx
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, libraryId))
    .get();
  if (!found) {
    throw new ORPCError("BAD_REQUEST", { message: "Unknown library id" });
  }
}

type MatchableFile = { size: number; mediaInfo: MediaInfo | null };

type EngineContext = Pick<Context, "db" | "events" | "logger">;

const JOB_CHUNK_SIZE = 500;

export function getFieldValues(
  field: ConditionField,
  file: MatchableFile,
): Scalar[] {
  const { mediaInfo } = file;
  if (field === "size") return [file.size];
  if (!mediaInfo) return [];
  switch (field) {
    case "container":
      return [mediaInfo.container];
    case "bitrate":
      return [mediaInfo.bitrate];
    case "videoCodec":
      return [mediaInfo.video.codec];
    case "width":
      return [mediaInfo.video.width];
    case "height":
      return [mediaInfo.video.height];
    case "audioCodec":
      return mediaInfo.audio.map((a) => a.codec);
    case "audioLanguages":
      return mediaInfo.audio.flatMap((a) => (a.language ? [a.language] : []));
  }
}

export function evaluateCondition(
  condition: Condition,
  file: MatchableFile,
): boolean {
  const values = getFieldValues(condition.field, file);
  const expected = Array.isArray(condition.value)
    ? condition.value
    : [condition.value];
  const matches = (value: Scalar) => expected.includes(value);
  switch (condition.operator) {
    case "eq":
    case "in":
      return values.some(matches);
    case "neq":
    case "notIn":
      return !values.some(matches);
    case "gt":
      return values.some(
        (value) =>
          typeof value === "number" &&
          typeof condition.value === "number" &&
          value > condition.value,
      );
    case "lt":
      return values.some(
        (value) =>
          typeof value === "number" &&
          typeof condition.value === "number" &&
          value < condition.value,
      );
  }
}

export function matchRule(
  rule: Pick<Rule, "conditions">,
  file: MatchableFile,
): boolean {
  return rule.conditions.every((condition) =>
    evaluateCondition(condition, file),
  );
}

export function findMatchingRule<
  R extends Pick<Rule, "enabled" | "conditions">,
>(rules: R[], file: MatchableFile): R | undefined {
  return rules.find((rule) => rule.enabled && matchRule(rule, file));
}

export async function createJobsForFiles(
  context: EngineContext,
  ids: FileId[],
) {
  const { db, events } = context;
  const createdJobs: JobId[] = [];
  const queuedFiles: FileId[] = [];
  const rulesByLibrary = new Map<
    LibraryId,
    { id: RuleId; enabled: boolean; conditions: Condition[] }[]
  >();

  db.transaction((tx) => {
    for (let start = 0; start < ids.length; start += JOB_CHUNK_SIZE) {
      const candidates = tx
        .select({
          id: files.id,
          libraryId: files.libraryId,
          size: files.size,
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
              enabled: rulesTable.enabled,
              conditions: rulesTable.conditions,
            })
            .from(rulesTable)
            .where(
              and(
                eq(rulesTable.libraryId, file.libraryId),
                eq(rulesTable.enabled, true),
              ),
            )
            .orderBy(asc(rulesTable.id))
            .all();
          rulesByLibrary.set(file.libraryId, rules);
        }
        const rule = findMatchingRule(rules, file);
        if (!rule) continue;
        const job = tx
          .insert(jobs)
          .values({ fileId: file.id, ruleId: rule.id })
          .returning({ id: jobs.id })
          .get();
        tx.update(files)
          .set({ status: "queued" })
          .where(eq(files.id, file.id))
          .run();
        createdJobs.push(job.id);
        queuedFiles.push(file.id);
      }
    }
  });

  for (const id of createdJobs) {
    await events.publish("event", { resource: "job", change: "created", id });
  }
  for (const id of queuedFiles) {
    await events.publish("event", { resource: "file", change: "updated", id });
  }

  return createdJobs.length;
}
