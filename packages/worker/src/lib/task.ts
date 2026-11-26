import type { Task } from "@formatarr/contract";
import { retry } from "es-toolkit";
import { client } from "@/lib/orpc";

export async function consumeTasks(
  onTask: (task: Task, signal: AbortSignal) => Promise<void>,
) {
  await retry(
    async () => {
      const connection = new AbortController();
      let running = Promise.resolve();
      try {
        for await (const task of await client.tasks.stream()) {
          running = running
            .then(() => onTask(task, connection.signal))
            .catch((error) => console.error("task failed:", error));
        }
        throw new Error("task stream closed");
      } finally {
        connection.abort();
        await running;
      }
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
