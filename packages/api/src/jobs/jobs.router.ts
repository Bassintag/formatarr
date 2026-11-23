import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const list = orpc.jobs.list.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const create = orpc.jobs.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.jobs.get.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const update = orpc.jobs.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const remove = orpc.jobs.remove.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const jobsRouter = orpc.jobs.router({
  list,
  create,
  get,
  update,
  remove,
});
