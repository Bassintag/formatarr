import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  UpdateSchema,
  VoidSchema,
} from "./common.contract";
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
  progress: z.number(),
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

export const ListJobsInputSchema = PaginationSchema.extend({
  status: JobStatusSchema.optional(),
  workerId: WorkerIdSchema.optional(),
  fileId: FileIdSchema.optional(),
});
export type ListJobsInput = z.infer<typeof ListJobsInputSchema>;

export const JobCreateSchema = z.object({ fileId: FileIdSchema });
export type JobCreate = z.infer<typeof JobCreateSchema>;

export const JobUpdateSchema = UpdateSchema(
  z.object({
    status: JobStatusSchema,
    progress: z.number().min(0).max(100),
    error: z.string(),
    workerId: WorkerIdSchema,
  }),
  JobIdSchema,
);
export type JobUpdate = z.infer<typeof JobUpdateSchema>;

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
      .route({ method: "PATCH", path: "/{id}" })
      .input(JobUpdateSchema)
      .output(JobSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(JobIdSchema))
      .output(VoidSchema),
  });
