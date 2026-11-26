import {
  type File as FileEntity,
  type FileId,
  FileStatusSchema,
  type IntegrationId,
  IntegrationTypeSchema,
  type JobId,
  JobStatusSchema,
  type LibraryId,
  type RuleId,
  RuleTypeSchema,
  type RuleValue,
  type Worker,
  type WorkerId,
} from "@formatarr/contract";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

function values<T extends string>(schema: { options: readonly T[] }) {
  return schema.options as unknown as [T, ...T[]];
}

export const libraries = sqliteTable("libraries", {
  id: integer().primaryKey({ autoIncrement: true }).$type<LibraryId>(),
  name: text().notNull(),
  path: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  scanCron: text("scan_cron"),
  watch: integer({ mode: "boolean" }).notNull().default(false),
});

export const integrations = sqliteTable("integrations", {
  id: integer().primaryKey({ autoIncrement: true }).$type<IntegrationId>(),
  type: text({ enum: values(IntegrationTypeSchema) }).notNull(),
  name: text().notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
});

export const libraryIntegrations = sqliteTable(
  "library_integrations",
  {
    libraryId: integer("library_id")
      .$type<LibraryId>()
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    integrationId: integer("integration_id")
      .$type<IntegrationId>()
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.libraryId, t.integrationId] })],
);

export const rules = sqliteTable(
  "rules",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<RuleId>(),
    libraryId: integer("library_id")
      .$type<LibraryId>()
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    type: text({ enum: values(RuleTypeSchema) }).notNull(),
    value: text({ mode: "json" }).$type<RuleValue["value"]>().notNull(),
  },
  (t) => [uniqueIndex("rules_library_type_idx").on(t.libraryId, t.type)],
);

export const files = sqliteTable(
  "files",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<FileId>(),
    libraryId: integer("library_id")
      .$type<LibraryId>()
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    path: text().notNull(),
    size: integer().notNull(),
    mediaInfo: text("media_info", { mode: "json" }).$type<
      FileEntity["mediaInfo"]
    >(),
    status: text({ enum: values(FileStatusSchema) })
      .notNull()
      .default("pending"),
    ignored: integer({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("files_library_path_idx").on(t.libraryId, t.path),
    index("files_status_idx").on(t.status),
  ],
);

export const workers = sqliteTable("workers", {
  id: integer().primaryKey({ autoIncrement: true }).$type<WorkerId>(),
  name: text().notNull(),
  tokenHash: text("token_hash").notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  capabilities: text({ mode: "json" })
    .$type<Worker["capabilities"]>()
    .notNull(),
  pathMappings: text("path_mappings", { mode: "json" })
    .$type<Worker["pathMappings"]>()
    .notNull()
    .default(sql`'[]'`),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer().primaryKey({ autoIncrement: true }).$type<JobId>(),
    fileId: integer("file_id")
      .$type<FileId>()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    workerId: integer("worker_id")
      .$type<WorkerId>()
      .references(() => workers.id, {
        onDelete: "set null",
      }),
    status: text({ enum: values(JobStatusSchema) })
      .notNull()
      .default("queued"),
    progress: real().notNull().default(0),
    error: text(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("jobs_file_idx").on(t.fileId),
    index("jobs_status_idx").on(t.status),
    index("jobs_worker_idx").on(t.workerId),
  ],
);

export const jobRules = sqliteTable(
  "job_rules",
  {
    jobId: integer("job_id")
      .$type<JobId>()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    ruleId: integer("rule_id")
      .$type<RuleId>()
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.ruleId] })],
);
