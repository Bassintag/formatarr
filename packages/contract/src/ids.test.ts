import { expect, test } from "bun:test";
import { FileIdSchema, type JobId, JobIdSchema } from "./ids";

test("ids coerce path params and reject invalid values", () => {
  expect(JobIdSchema.parse("12")).toBe(12 as JobId);
  expect(JobIdSchema.safeParse("abc").success).toBe(false);
  expect(JobIdSchema.safeParse(0).success).toBe(false);
});

test("ids of different resources are not interchangeable", () => {
  const fileId = FileIdSchema.parse(1);
  // @ts-expect-error
  const jobId: JobId = fileId;
  expect(jobId).toBe(1 as JobId);
});
