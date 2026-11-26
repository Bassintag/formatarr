import type { Task } from "@formatarr/contract";
import { retry } from "es-toolkit";
import { client } from "@/lib/orpc";

export async function consumeTasks(onTask: (task: Task) => void) {
  await retry(
    async () => {
      for await (const task of await client.tasks.stream()) onTask(task);
      throw new Error("task stream closed");
    },
    {
      delay: (attempts) => Math.min(100 * 2 ** attempts, 10_000),
      shouldRetry: (error) => {
        console.error(
          "task stream failed:",
          error instanceof Error ? error.message : error,
        );
        return true;
      },
    },
  );
}
