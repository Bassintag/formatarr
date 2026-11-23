import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { FileIdSchema, JobIdSchema, WorkerIdSchema } from "./ids";
import { orpc } from "./orpc";

const change = z.enum(["created", "updated", "deleted"]);

export const EventSchema = z.discriminatedUnion("resource", [
  z.object({ resource: z.literal("job"), change, id: JobIdSchema }),
  z.object({ resource: z.literal("file"), change, id: FileIdSchema }),
  z.object({ resource: z.literal("worker"), change, id: WorkerIdSchema }),
]);
export type AppEvent = z.infer<typeof EventSchema>;

export const eventsContract = orpc.router({
  stream: orpc
    .route({ method: "GET", path: "/events", tags: ["events"] })
    .output(eventIterator(EventSchema)),
});
