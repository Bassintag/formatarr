import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const list = orpc.libraries.list.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const create = orpc.libraries.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.libraries.get.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const update = orpc.libraries.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const remove = orpc.libraries.remove.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const librariesRouter = orpc.libraries.router({
  list,
  create,
  get,
  update,
  remove,
});
