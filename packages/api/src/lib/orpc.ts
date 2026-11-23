import { contract } from "@formatarr/contract";
import { implement } from "@orpc/server";
import { authMiddleware } from "@/auth/auth.middleware";
import type { RequestContext } from "@/context";

export const orpc = implement(contract)
  .$context<RequestContext>()
  .use(authMiddleware);
