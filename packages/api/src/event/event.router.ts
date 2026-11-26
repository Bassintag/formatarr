import { userAuth } from "@/auth/auth.middleware";
import { orpc } from "@/lib/orpc";

const userEvents = orpc.events.use(userAuth);

const stream = userEvents.stream.handler(async function* ({ context, signal }) {
  yield* context.events.subscribe("event", { signal });
});

export const eventsRouter = orpc.events.router({ stream });
