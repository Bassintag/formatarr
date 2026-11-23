import {
  type Action,
  type Condition,
  type File as FileEntity,
  FileStatusSchema,
  IntegrationTypeSchema,
  JobStatusSchema,
  type Worker,
  WorkerStatusSchema,
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
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  path: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
});

export const integrations = sqliteTable("integrations", {
  id: integer().primaryKey({ autoIncrement: true }),
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
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    integrationId: integer("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.libraryId, t.integrationId] })],
);

export const rules = sqliteTable(
  "rules",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    libraryId: integer("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    name: text().notNull(),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    position: integer().notNull(),
    conditions: text({ mode: "json" }).$type<Condition[]>().notNull(),
    actions: text({ mode: "json" }).$type<Action[]>().notNull(),
  },
  (t) => [
    uniqueIndex("rules_library_position_idx").on(t.libraryId, t.position),
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    libraryId: integer("library_id")
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
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text({ enum: values(WorkerStatusSchema) })
    .notNull()
    .default("offline"),
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
    id: integer().primaryKey({ autoIncrement: true }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => rules.id, { onDelete: "cascade" }),
    workerId: integer("worker_id").references(() => workers.id, {
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
