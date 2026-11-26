import type { ContractRouterClient } from "@orpc/contract";
import { authContract } from "./auth.contract";
import { eventsContract } from "./event.contract";
import { filesContract } from "./file.contract";
import { healthContract } from "./health.contract";
import { integrationsContract } from "./integration.contract";
import { jobsContract } from "./job.contract";
import { librariesContract } from "./library.contract";
import { orpc } from "./orpc";
import { scansContract } from "./scan.contract";
import { settingsContract } from "./settings.contract";
import { tasksContract } from "./task.contract";
import { workersContract } from "./worker.contract";

export const contract = orpc.router({
  health: healthContract,
  auth: authContract,
  libraries: librariesContract,
  scans: scansContract,
  files: filesContract,
  jobs: jobsContract,
  tasks: tasksContract,
  workers: workersContract,
  integrations: integrationsContract,
  events: eventsContract,
  settings: settingsContract,
});

export type ApiClient = ContractRouterClient<typeof contract>;
