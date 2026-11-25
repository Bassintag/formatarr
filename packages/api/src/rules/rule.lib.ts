import type {
  FileId,
  JobId,
  LibraryId,
  MediaInfo,
  RuleId,
  RuleValue,
} from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Context } from "@/context";
import {
  files,
  jobRules,
  jobs,
  libraries,
  rules as rulesTable,
} from "@/db/schema";
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

type EngineContext = Pick<Context, "db" | "events" | "logger">;

const JOB_CHUNK_SIZE = 500;

export async function createJobsForFiles(
  context: EngineContext,
  ids: FileId[],
) {
  const { db, events } = context;
  const createdJobs: JobId[] = [];
  const updatedFiles: FileId[] = [];
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
          updatedFiles.push(file.id);
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
        updatedFiles.push(file.id);
      }
    }
  });

  for (const id of createdJobs) {
    await events.publish("event", { resource: "job", change: "created", id });
  }
  for (const id of updatedFiles) {
    await events.publish("event", { resource: "file", change: "updated", id });
  }

  return createdJobs.length;
}

export async function reevaluateLibrary(
  context: EngineContext,
  libraryId: LibraryId,
) {
  const { db, events } = context;

  const { ids, reset } = db.transaction((tx) => {
    const candidates = tx
      .select({ id: files.id, status: files.status })
      .from(files)
      .where(
        and(
          eq(files.libraryId, libraryId),
          inArray(files.status, ["pending", "done"]),
          eq(files.ignored, false),
          isNotNull(files.mediaInfo),
        ),
      )
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
    return { ids: candidates.map((file) => file.id), reset };
  });

  for (const id of reset) {
    await events.publish("event", { resource: "file", change: "updated", id });
  }

  return createJobsForFiles(context, ids);
}

function onlyAllowed(tracks: { language: string | null }[], allowed: string[]) {
  return tracks.every(
    ({ language }) => language === null || allowed.includes(language),
  );
}

export function isSatisfied(rule: RuleValue, mediaInfo: MediaInfo): boolean {
  switch (rule.type) {
    case "container":
      return mediaInfo.container === rule.value;
    case "videoCodec":
      return mediaInfo.video.codec === rule.value;
    case "maxResolution":
      return mediaInfo.video.height <= rule.value;
    case "maxBitrate":
      return mediaInfo.bitrate <= rule.value;
    case "audioCodec":
      return mediaInfo.audio.every((track) => track.codec === rule.value);
    case "audioLanguages":
      return onlyAllowed(mediaInfo.audio, rule.value);
    case "subtitleLanguages":
      return onlyAllowed(mediaInfo.subtitles, rule.value);
  }
}

export function findUnmetRules<R extends RuleValue>(
  rules: R[],
  mediaInfo: MediaInfo,
): R[] {
  return rules.filter((rule) => !isSatisfied(rule, mediaInfo));
}
