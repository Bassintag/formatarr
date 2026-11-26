import { expect, test } from "bun:test";
import { JobSchema, JobUpdateSchema } from "./job.contract";

const job = {
  id: 1,
  fileId: 2,
  rules: [
    { id: 3, libraryId: 1, enabled: true, type: "maxBitrate", value: 8000 },
  ],
  status: "running",
  workerId: null,
  progress: 42,
  error: null,
  createdAt: new Date(),
  attempts: 0,
  startedAt: null,
  finishedAt: null,
};

test("JobSchema accepts a valid job", () => {
  expect(JobSchema.safeParse(job).success).toBe(true);
});

test("JobUpdateSchema rejects a progress outside 0-100", () => {
  expect(JobUpdateSchema.safeParse({ id: 1, progress: 101 }).success).toBe(
    false,
  );
});

test("JobUpdateSchema only accepts a failure", () => {
  const update = { id: 1, progress: 100 };
  expect(
    JobUpdateSchema.safeParse({ ...update, status: "failed" }).success,
  ).toBe(true);
  expect(
    JobUpdateSchema.safeParse({ ...update, status: "succeeded" }).success,
  ).toBe(false);
});

test("JobUpdateSchema requires a progress", () => {
  expect(JobUpdateSchema.safeParse({ id: 1 }).success).toBe(false);
});

test("JobSchema rejects an unknown status", () => {
  expect(JobSchema.safeParse({ ...job, status: "paused" }).success).toBe(false);
});
