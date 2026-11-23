import { contract } from "@formatarr/contract";
import { implement } from "@orpc/server";
import type { Context } from "@/context";

export const orpc = implement(contract).$context<
  Context & { request: Request }
>();
