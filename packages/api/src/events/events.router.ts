import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const stream = orpc.events.stream.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const eventsRouter = orpc.events.router({ stream });
