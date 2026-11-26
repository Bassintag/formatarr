import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  UpdateSchema,
  VoidSchema,
} from "./common.contract";
import { JobIdSchema, WorkerIdSchema } from "./ids";
import { orpc } from "./orpc";

export const WorkerStatusSchema = z.enum(["online", "offline"]);
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
  name: z.string(),
  status: WorkerStatusSchema,
  enabled: z.boolean(),
  capabilities: WorkerCapabilitiesSchema,
  pathMappings: z.array(PathMappingSchema),
  runningJobs: z.array(z.object({ id: JobIdSchema })),
  lastSeenAt: z.date().nullable(),
});
export type Worker = z.infer<typeof WorkerSchema>;

export const CreatedWorkerSchema = WorkerSchema.extend({
  token: z.string(),
});
export type CreatedWorker = z.infer<typeof CreatedWorkerSchema>;

export const WorkerTokenSchema = z.object({
  token: z.string(),
});
export type WorkerToken = z.infer<typeof WorkerTokenSchema>;

export const WorkerCreateSchema = z.object({
  name: z.string().min(1),
  capabilities: WorkerCapabilitiesSchema,
});
export type WorkerCreate = z.infer<typeof WorkerCreateSchema>;

export const WorkerUpdateSchema = UpdateSchema(
  WorkerCreateSchema.omit({ capabilities: true }).extend({
    enabled: z.boolean(),
    pathMappings: z.array(PathMappingSchema),
  }),
  WorkerIdSchema,
);
export type WorkerUpdate = z.infer<typeof WorkerUpdateSchema>;

export const workersContract = orpc
  .route({ prefix: "/workers", tags: ["workers"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(WorkerSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(WorkerCreateSchema)
      .output(CreatedWorkerSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(WorkerSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(WorkerUpdateSchema)
      .output(WorkerSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(VoidSchema),
    regenerateToken: orpc
      .route({ method: "POST", path: "/{id}/token" })
      .input(IdParamsSchema(WorkerIdSchema))
      .output(WorkerTokenSchema),
  });
