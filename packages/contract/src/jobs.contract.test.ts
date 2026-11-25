import { expect, test } from "bun:test";
import { JobSchema, JobUpdateSchema } from "./jobs.contract";

const job = {
  id: 1,
  fileId: 2,
  ruleId: 3,
  status: "running",
  workerId: null,
  progress: 42,
  error: null,
  createdAt: new Date(),
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

test("JobSchema rejects an unknown status", () => {
  expect(JobSchema.safeParse({ ...job, status: "paused" }).success).toBe(false);
});
