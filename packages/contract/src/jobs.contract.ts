import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
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

export const ListJobsInputSchema = PaginationSchema.extend({
  status: JobStatusSchema.optional(),
  workerId: WorkerIdSchema.optional(),
  fileId: FileIdSchema.optional(),
});
export type ListJobsInput = z.infer<typeof ListJobsInputSchema>;

export const CreateJobInputSchema = z.object({ fileId: FileIdSchema });
export type CreateJobInput = z.infer<typeof CreateJobInputSchema>;

export const UpdateJobInputSchema = z.object({
  id: JobIdSchema,
  status: JobStatusSchema.optional(),
  progress: JobSchema.shape.progress.optional(),
  error: z.string().optional(),
  workerId: WorkerIdSchema.optional(),
});
export type UpdateJobInput = z.infer<typeof UpdateJobInputSchema>;

export const jobsContract = orpc
  .route({ prefix: "/jobs", tags: ["jobs"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(ListJobsInputSchema)
      .output(PageSchema(JobSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(CreateJobInputSchema)
      .output(JobSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(JobIdSchema))
      .output(JobSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(UpdateJobInputSchema)
      .output(JobSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(JobIdSchema))
      .output(VoidSchema),
  });
