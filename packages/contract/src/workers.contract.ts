import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  VoidSchema,
} from "./common.contract";
import { JobIdSchema, WorkerIdSchema } from "./ids";
import { JobOfferSchema } from "./jobs.contract";
import { orpc } from "./orpc";

export const WorkerStatusSchema = z.enum(["online", "busy", "offline"]);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

export const WorkerCapabilitiesSchema = z.object({
  ffmpegVersion: z.string(),
  hwaccels: z.array(z.string()),
});
export type WorkerCapabilities = z.infer<typeof WorkerCapabilitiesSchema>;

export const PathMappingSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type PathMapping = z.infer<typeof PathMappingSchema>;

export const WorkerSchema = z.object({
  id: WorkerIdSchema,
  name: z.string().min(1),
  status: WorkerStatusSchema,
  enabled: z.boolean(),
  capabilities: WorkerCapabilitiesSchema,
  pathMappings: z.array(PathMappingSchema),
  currentJobId: JobIdSchema.nullable(),
  lastSeenAt: z.date().nullable(),
});
export type Worker = z.infer<typeof WorkerSchema>;

export const CreateWorkerInputSchema = z.object({
  name: z.string().min(1),
  capabilities: WorkerCapabilitiesSchema,
});
export type CreateWorkerInput = z.infer<typeof CreateWorkerInputSchema>;

export const UpdateWorkerInputSchema = z.object({
  id: WorkerIdSchema,
  name: WorkerSchema.shape.name.optional(),
  enabled: z.boolean().optional(),
  pathMappings: z.array(PathMappingSchema).optional(),
});
export type UpdateWorkerInput = z.infer<typeof UpdateWorkerInputSchema>;

export const workersContract = orpc
  .route({ prefix: "/workers", tags: ["workers"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(WorkerSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(CreateWorkerInputSchema)
      .output(WorkerSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(WorkerSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(UpdateWorkerInputSchema)
      .output(WorkerSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(VoidSchema),
    jobs: orpc
      .route({ method: "GET", path: "/{id}/jobs" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(eventIterator(JobOfferSchema)),
  });
