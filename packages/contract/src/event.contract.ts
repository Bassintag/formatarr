import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { JobIdSchema, WorkerIdSchema } from "./ids";
import { JobSchema, JobStatusSchema } from "./job.contract";
import { orpc } from "./orpc";

export const AppEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("worker.connected"),
    id: WorkerIdSchema,
  }),
  z.object({
    type: z.literal("worker.disconnected"),
    id: WorkerIdSchema,
  }),
  z.object({
    type: z.literal("job.status"),
    id: JobIdSchema,
    status: JobStatusSchema,
  }),
  z.object({
    type: z.literal("job.progress"),
    id: JobIdSchema,
    progress: JobSchema.shape.progress,
  }),
]);
export type AppEvent = z.infer<typeof AppEventSchema>;

export const eventsContract = orpc
  .route({ prefix: "/events", tags: ["events"] })
  .router({
    stream: orpc
      .route({ method: "GET", path: "/" })
      .output(eventIterator(AppEventSchema)),
  });
