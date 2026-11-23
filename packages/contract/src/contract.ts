import type { ContractRouterClient } from "@orpc/contract";
import { healthContract } from "./health.contract";
import { orpc } from "./orpc";

export const contract = orpc.router({
  health: healthContract,
});

export type ApiClient = ContractRouterClient<typeof contract>;
