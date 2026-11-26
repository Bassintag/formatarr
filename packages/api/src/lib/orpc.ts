import { contract } from "@formatarr/contract";
import { implement } from "@orpc/server";
import type { RequestContext } from "@/context";

export const orpc = implement(contract).$context<RequestContext>();
