import { expect, test } from "bun:test";
import type {
  Integration,
  IntegrationCreate,
  Job,
  JobCreate,
  Library,
  LibraryCreate,
  Worker,
  WorkerCreate,
} from "./index";

test("entities are assignable to their create schema", () => {
  const library = {} as Library;
  const integration = {} as Integration;
  const job = {} as Job;
  const worker = {} as Worker;
  const values: [LibraryCreate, IntegrationCreate, JobCreate, WorkerCreate] = [
    library,
    integration,
    job,
    worker,
  ];
  expect(values).toHaveLength(4);
});
