import type { Task, WorkerId } from "@formatarr/contract";
import { MemoryPublisher } from "@orpc/publisher/memory";

type WorkerMessage = { type: "task"; task: Task } | { type: "close" };

type Channel = `workers/${number}`;

export function createWorkers() {
  const connected = new Set<WorkerId>();
  const channels = new MemoryPublisher<Record<Channel, WorkerMessage>>();
  const channel = (id: WorkerId): Channel => `workers/${id}`;

  function isConnected(id: WorkerId) {
    return connected.has(id);
  }

  function connect(id: WorkerId, signal?: AbortSignal) {
    if (connected.has(id)) return;
    const messages = channels.subscribe(channel(id), { signal });
    connected.add(id);
    return messages;
  }

  function disconnect(id: WorkerId) {
    connected.delete(id);
  }

  async function close(id: WorkerId) {
    await channels.publish(channel(id), { type: "close" });
  }

  function dispatch(claim: (id: WorkerId) => Task | undefined) {
    return [...connected].flatMap((id) => {
      const task = claim(id);
      if (!task) return [];
      connected.delete(id);
      connected.add(id);
      void channels.publish(channel(id), { type: "task", task });
      return [task];
    });
  }

  return { isConnected, connect, disconnect, close, dispatch };
}
