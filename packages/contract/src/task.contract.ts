import { eventIterator } from "@orpc/contract";
import { z } from "zod";
import { MediaInfoSchema } from "./file.contract";
import { JobSchema } from "./job.contract";
import { orpc, workerMeta } from "./orpc";

export const TaskSchema = z.object({
  job: JobSchema,
  sourcePath: z.string(),
  outputPath: z.string(),
  mediaInfo: MediaInfoSchema,
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
