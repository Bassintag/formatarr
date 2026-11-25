import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { FileIdSchema, JobIdSchema, WorkerIdSchema } from "./ids";
import { orpc } from "./orpc";

export const EventChangeSchema = z.enum(["created", "updated", "deleted"]);
export type EventChange = z.infer<typeof EventChangeSchema>;

export const AppEventSchema = z.discriminatedUnion("resource", [
  z.object({
    resource: z.literal("job"),
    change: EventChangeSchema,
    id: JobIdSchema,
  }),
  z.object({
    resource: z.literal("file"),
    change: EventChangeSchema,
    id: FileIdSchema,
  }),
  z.object({
    resource: z.literal("worker"),
    change: EventChangeSchema,
    id: WorkerIdSchema,
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
