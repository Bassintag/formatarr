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

function setup() {
  return createTestDb();
}

function seed(db: ReturnType<typeof setup>) {
  const library = db
    .insert(libraries)
    .values({ name: "Movies", path: "/movies" })
    .returning()
    .get();
  const integration = db
    .insert(integrations)
    .values({ type: "radarr", name: "r", baseUrl: "http://r", apiKey: "k" })
    .returning()
    .get();
  db.insert(libraryIntegrations)
    .values({ libraryId: library.id, integrationId: integration.id })
    .run();
  db.insert(rules)
    .values({ libraryId: library.id, type: "container", value: "mkv" })
    .run();
  const file = db
    .insert(files)
    .values({ libraryId: library.id, path: "/movies/a.mkv", size: 1 })
    .returning()
    .get();
  const worker = db
    .insert(workers)
    .values({
      name: "w",
      tokenHash: "h",
    })
    .returning()
    .get();
  const job = db
    .insert(jobs)
    .values({ fileId: file.id, workerId: worker.id })
    .returning()
    .get();
  return { library: library, worker: worker, job: job };
}

test("relational query returns integrations through the join table", () => {
  const db = setup();
  seed(db);
  const result = db.query.libraries
    .findMany({
      with: { integrations: true },
    })
    .sync();
  expect(result[0]?.integrations).toHaveLength(1);
});

test("deleting a worker nulls jobs.workerId", () => {
  const db = setup();
  const { worker, job } = seed(db);
  db.delete(workers).where(eq(workers.id, worker.id)).run();
  const after = db.query.jobs.findFirst({ where: { id: job.id } }).sync();
  expect(after?.workerId).toBeNull();
});

test("deleting a library cascades to files, rules and jobs", () => {
  const db = setup();
  const { library } = seed(db);
  db.delete(libraries).where(eq(libraries.id, library.id)).run();
  expect(db.query.files.findMany().sync()).toHaveLength(0);
  expect(db.query.rules.findMany().sync()).toHaveLength(0);
  expect(db.query.jobs.findMany().sync()).toHaveLength(0);
});
