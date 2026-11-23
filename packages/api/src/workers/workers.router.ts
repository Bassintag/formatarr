import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const list = orpc.workers.list.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const create = orpc.workers.create.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const get = orpc.workers.get.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const update = orpc.workers.update.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const remove = orpc.workers.remove.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const jobs = orpc.workers.jobs.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const workersRouter = orpc.workers.router({
  list,
  create,
  get,
  update,
  remove,
  jobs,
});
