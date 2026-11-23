import { orpc } from "@/lib/orpc";

const stream = orpc.events.stream.handler(async function* ({
  context,
  signal,
}) {
  yield* context.events.subscribe("event", { signal });
});

export const eventsRouter = orpc.events.router({ stream });
