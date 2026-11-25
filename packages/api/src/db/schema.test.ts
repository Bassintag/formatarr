import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  files,
  integrations,
  jobs,
  libraries,
  libraryIntegrations,
  rules,
  workers,
} from "@/db/schema";
import { createTestDb } from "@/testing/harness";

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("expected a row");
  }
  return row;
}

function setup() {
  return createTestDb();
}

async function seed(db: ReturnType<typeof setup>) {
  const library = await db
    .insert(libraries)
    .values({ name: "Movies", path: "/movies" })
    .returning()
    .then(one);
  const integration = await db
    .insert(integrations)
    .values({ type: "radarr", name: "r", baseUrl: "http://r", apiKey: "k" })
    .returning()
    .then(one);
  await db
    .insert(libraryIntegrations)
    .values({ libraryId: library.id, integrationId: integration.id });
  await db
    .insert(rules)
    .values({ libraryId: library.id, type: "container", value: "mkv" });
  const file = await db
    .insert(files)
    .values({ libraryId: library.id, path: "/movies/a.mkv", size: 1 })
    .returning()
    .then(one);
  const worker = await db
    .insert(workers)
    .values({
      name: "w",
      tokenHash: "h",
      capabilities: { ffmpegVersion: "7", hwaccels: [] },
    })
    .returning()
    .then(one);
  const job = await db
    .insert(jobs)
    .values({ fileId: file.id, workerId: worker.id })
    .returning()
    .then(one);
  return { library: library, worker: worker, job: job };
}

test("relational query returns integrations through the join table", async () => {
  const db = setup();
  await seed(db);
  const result = await db.query.libraries.findMany({
    with: { integrations: true },
  });
  expect(result[0]?.integrations).toHaveLength(1);
});

test("deleting a worker nulls jobs.workerId", async () => {
  const db = setup();
  const { worker, job } = await seed(db);
  await db.delete(workers).where(eq(workers.id, worker.id));
  const after = await db.query.jobs.findFirst({ where: { id: job.id } });
  expect(after?.workerId).toBeNull();
});

test("deleting a library cascades to files, rules and jobs", async () => {
  const db = setup();
  const { library } = await seed(db);
  await db.delete(libraries).where(eq(libraries.id, library.id));
  expect(await db.query.files.findMany()).toHaveLength(0);
  expect(await db.query.rules.findMany()).toHaveLength(0);
  expect(await db.query.jobs.findMany()).toHaveLength(0);
});
