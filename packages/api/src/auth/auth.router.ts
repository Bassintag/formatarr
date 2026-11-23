import { ORPCError } from "@orpc/server";
import { orpc } from "@/lib/orpc";

const login = orpc.auth.login.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

const refresh = orpc.auth.refresh.handler(() => {
  // TODO: implement
  throw new ORPCError("NOT_IMPLEMENTED");
});

export const authRouter = orpc.auth.router({ login, refresh });
