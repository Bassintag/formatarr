import { workerAuth } from "@/auth/auth.middleware";
import { orpc } from "@/lib/orpc";
import { dispatchTasks } from "@/task/task.lib";
import { connectWorker, disconnectWorker } from "@/worker/worker.lib";

const workerTasks = orpc.tasks.use(workerAuth);

const stream = workerTasks.stream.handler(async function* ({
  context,
  signal,
}) {
  const { worker } = context;
  const messages = await connectWorker(context, worker.id, signal);
  try {
    await dispatchTasks(context);
    for await (const message of messages) {
      if (message.type === "close") return;
      yield message.task;
    }
  } finally {
    await disconnectWorker(context, worker.id);
  }
});

export const tasksRouter = orpc.tasks.router({
  stream,
});
