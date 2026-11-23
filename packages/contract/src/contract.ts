import type { ContractRouterClient } from "@orpc/contract";
import { authContract } from "./auth.contract";
import { eventsContract } from "./events.contract";
import { filesContract } from "./files.contract";
import { healthContract } from "./health.contract";
import { integrationsContract } from "./integrations.contract";
import { jobsContract } from "./jobs.contract";
import { librariesContract } from "./libraries.contract";
import { orpc } from "./orpc";
import { rulesContract } from "./rules.contract";
import { scansContract } from "./scans.contract";
import { workersContract } from "./workers.contract";

export const contract = orpc.router({
  health: healthContract,
  auth: authContract,
  libraries: librariesContract,
  rules: rulesContract,
  scans: scansContract,
  files: filesContract,
  jobs: jobsContract,
  workers: workersContract,
  integrations: integrationsContract,
  events: eventsContract,
});

export type ApiClient = ContractRouterClient<typeof contract>;
