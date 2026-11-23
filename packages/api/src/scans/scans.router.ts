import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const create = orpc.scans.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const scansRouter = orpc.scans.router({ create });
