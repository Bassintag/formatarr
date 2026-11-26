import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { JobSchema } from "./job.contract";
import { orpc, workerMeta } from "./orpc";

export const TaskSchema = z.object({
  job: JobSchema,
  sourcePath: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

export const tasksContract = orpc
  .route({ prefix: "/tasks", tags: ["tasks"] })
  .router({
    stream: orpc
      .meta(workerMeta)
      .route({ method: "GET", path: "/" })
      .output(eventIterator(TaskSchema)),
  });
