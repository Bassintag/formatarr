import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const list = orpc.integrations.list.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const create = orpc.integrations.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.integrations.get.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const update = orpc.integrations.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const remove = orpc.integrations.remove.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const integrationsRouter = orpc.integrations.router({
  list,
  create,
  get,
  update,
  remove,
});
