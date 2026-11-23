import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
import { FileIdSchema, JobIdSchema, RuleIdSchema, WorkerIdSchema } from "./ids";
import { orpc } from "./orpc";
import { ActionSchema } from "./rules.contract";

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
  ruleId: RuleIdSchema,
  status: JobStatusSchema,
  workerId: WorkerIdSchema.nullable(),
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobOfferSchema = z.object({
  job: JobSchema,
  sourcePath: z.string(),
  actions: z.array(ActionSchema),
});
export type JobOffer = z.infer<typeof JobOfferSchema>;

const tags = ["jobs"];

export const jobsContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/jobs", tags })
    .input(
      PaginationSchema.extend({
        status: JobStatusSchema.optional(),
        workerId: WorkerIdSchema.optional(),
        fileId: FileIdSchema.optional(),
      }),
    )
    .output(pageOf(JobSchema)),
  create: orpc
    .route({ method: "POST", path: "/jobs", tags })
    .input(z.object({ fileId: FileIdSchema }))
    .output(JobSchema),
  get: orpc
    .route({ method: "GET", path: "/jobs/{id}", tags })
    .input(z.object({ id: JobIdSchema }))
    .output(JobSchema),
  update: orpc
    .route({ method: "PATCH", path: "/jobs/{id}", tags })
    .input(
      z.object({
        id: JobIdSchema,
        status: JobStatusSchema.optional(),
        progress: JobSchema.shape.progress.optional(),
        error: z.string().optional(),
        workerId: WorkerIdSchema.optional(),
      }),
    )
    .output(JobSchema),
  remove: orpc
    .route({ method: "DELETE", path: "/jobs/{id}", tags })
    .input(z.object({ id: JobIdSchema }))
    .output(z.void()),
});
