import type { FileId, LibraryId, MediaInfo, RuleId } from "@formatarr/contract";
import type { Context } from "@/context";
import {
  files,
  integrations,
  jobRules,
  jobs,
  libraries,
  libraryIntegrations,
  rules,
  workers,
} from "@/db/schema";

type Db = Context["db"];
type LibraryValues = Partial<typeof libraries.$inferInsert>;
type FileValues = Partial<typeof files.$inferInsert>;
type RuleValues = Partial<typeof rules.$inferInsert>;
type JobValues = Partial<typeof jobs.$inferInsert>;
type WorkerValues = Partial<typeof workers.$inferInsert>;
type IntegrationValues = Partial<typeof integrations.$inferInsert>;

export const unknownId = 999 as never;

export const sampleMediaInfo: MediaInfo = {
  container: "mkv",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080, bitrate: 4500 },
  audio: [{ codec: "aac", language: "eng", channels: 2 }],
  subtitles: [],
};

let sequence = 0;

export function seedLibrary(db: Db, values: LibraryValues = {}) {
  return db
    .insert(libraries)
    .values({ name: "lib", path: "/tmp", ...values })
    .returning()
    .get();
}

export function seedFile(
  db: Db,
  libraryId: LibraryId,
  values: FileValues = {},
) {
  sequence += 1;
  return db
    .insert(files)
    .values({
      libraryId,
      path: `/tmp/file-${sequence}.mkv`,
      size: 1,
      ...values,
    })
    .returning()
    .get();
}

export function seedRule(
  db: Db,
  libraryId: LibraryId,
  values: RuleValues = {},
) {
  return db
    .insert(rules)
    .values({
      libraryId,
      type: "container",
      value: "mkv",
      ...values,
    })
    .returning()
    .get();
}

export function seedJob(
  db: Db,
  fileId: FileId,
  ruleIds: RuleId[] = [],
  values: JobValues = {},
) {
  const job = db
    .insert(jobs)
    .values({ fileId, ...values })
    .returning()
    .get();
  if (ruleIds.length > 0) {
    db.insert(jobRules)
      .values(ruleIds.map((ruleId) => ({ jobId: job.id, ruleId })))
      .run();
  }
  return job;
}

export function seedWorker(db: Db, values: WorkerValues = {}) {
  return db
    .insert(workers)
    .values({
      name: "w",
      tokenHash: "h",
      ...values,
    })
    .returning()
    .get();
}

export function seedIntegration(
  db: Db,
  libraryIds: LibraryId[] = [],
  values: IntegrationValues = {},
) {
  const integration = db
    .insert(integrations)
    .values({
      type: "radarr",
      name: "arr",
      baseUrl: "http://arr.test",
      apiKey: "secret",
      ...values,
    })
    .returning()
    .get();
  if (libraryIds.length > 0) {
    db.insert(libraryIntegrations)
      .values(
        libraryIds.map((libraryId) => ({
          libraryId,
          integrationId: integration.id,
        })),
      )
      .run();
  }
  return integration;
}
