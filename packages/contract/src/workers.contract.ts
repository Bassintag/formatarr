import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
import { JobIdSchema, WorkerIdSchema } from "./ids";
import { JobOfferSchema } from "./jobs.contract";
import { orpc } from "./orpc";

export const WorkerStatusSchema = z.enum(["online", "busy", "offline"]);

export const WorkerCapabilitiesSchema = z.object({
  ffmpegVersion: z.string(),
  hwaccels: z.array(z.string()),
});

export const PathMappingSchema = z.object({
  from: z.string(),
  to: z.string(),
});

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

const tags = ["workers"];

export const workersContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/workers", tags })
    .input(PaginationSchema)
    .output(pageOf(WorkerSchema)),
  create: orpc
    .route({ method: "POST", path: "/workers", tags })
    .input(
      z.object({
        name: z.string().min(1),
        capabilities: WorkerCapabilitiesSchema,
      }),
    )
    .output(WorkerSchema),
  get: orpc
    .route({ method: "GET", path: "/workers/{id}", tags })
    .input(z.object({ id: WorkerIdSchema }))
    .output(WorkerSchema),
  update: orpc
    .route({ method: "PATCH", path: "/workers/{id}", tags })
    .input(
      z.object({
        id: WorkerIdSchema,
        name: WorkerSchema.shape.name.optional(),
        enabled: z.boolean().optional(),
        pathMappings: z.array(PathMappingSchema).optional(),
      }),
    )
    .output(WorkerSchema),
  remove: orpc
    .route({ method: "DELETE", path: "/workers/{id}", tags })
    .input(z.object({ id: WorkerIdSchema }))
    .output(z.void()),
  jobs: orpc
    .route({ method: "GET", path: "/workers/{id}/jobs", tags })
    .input(z.object({ id: WorkerIdSchema }))
    .output(eventIterator(JobOfferSchema)),
});
