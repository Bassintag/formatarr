import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const list = orpc.files.list.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.files.get.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const update = orpc.files.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const filesRouter = orpc.files.router({ list, get, update });
