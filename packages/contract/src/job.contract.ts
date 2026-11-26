import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  VoidSchema,
} from "./common.contract";
import { FileIdSchema, JobIdSchema, WorkerIdSchema } from "./ids";
import { orpc, workerMeta } from "./orpc";
import { RuleSchema } from "./rule.contract";

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: JobIdSchema,
  fileId: FileIdSchema,
  rules: z.array(RuleSchema),
  status: JobStatusSchema,
  workerId: WorkerIdSchema.nullable(),
  progress: z.number(),
  error: z.string().nullable(),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const ListJobsInputSchema = PaginationSchema.extend({
  status: JobStatusSchema.optional(),
  workerId: WorkerIdSchema.optional(),
  fileId: FileIdSchema.optional(),
});
export type ListJobsInput = z.infer<typeof ListJobsInputSchema>;

export const JobCreateSchema = z.object({ fileId: FileIdSchema });
export type JobCreate = z.infer<typeof JobCreateSchema>;

export const JobUpdateSchema = z.object({
  id: JobIdSchema,
  progress: z.number().min(0).max(100),
  status: JobStatusSchema.extract(["failed"]).optional(),
  error: z.string().optional(),
});
export type JobUpdate = z.infer<typeof JobUpdateSchema>;

export const JobResultSchema = z.object({
  params: IdParamsSchema(JobIdSchema),
  query: z.object({ size: z.coerce.number().int().nonnegative() }),
  body: z.instanceof(ReadableStream<Uint8Array>),
});
export type JobResult = z.infer<typeof JobResultSchema>;

export const jobsContract = orpc
  .route({ prefix: "/jobs", tags: ["jobs"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(ListJobsInputSchema)
      .output(PageSchema(JobSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(JobCreateSchema)
      .output(JobSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(JobIdSchema))
      .output(JobSchema),
    update: orpc
      .meta(workerMeta)
      .route({ method: "PATCH", path: "/{id}" })
      .input(JobUpdateSchema)
      .output(JobSchema),
    source: orpc
      .meta(workerMeta)
      .route({
        method: "GET",
        path: "/{id}/source",
        responseBodyHint: "octet-stream",
      })
      .input(IdParamsSchema(JobIdSchema))
      .output(z.instanceof(ReadableStream<Uint8Array>)),
    result: orpc
      .meta(workerMeta)
      .route({
        method: "PUT",
        path: "/{id}/result",
        inputStructure: "detailed",
        requestBodyHint: "octet-stream",
      })
      .input(JobResultSchema)
      .output(JobSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(JobIdSchema))
      .output(VoidSchema),
  });
