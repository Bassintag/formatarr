import { authRouter } from "./auth/auth.router";
import { eventsRouter } from "./events/events.router";
import { filesRouter } from "./files/files.router";
import { healthRouter } from "./health/health.router";
import { integrationsRouter } from "./integrations/integrations.router";
import { jobsRouter } from "./jobs/jobs.router";
import { orpc } from "./lib/orpc";
import { librariesRouter } from "./libraries/libraries.router";
import { rulesRouter } from "./rules/rules.router";
import { scansRouter } from "./scans/scans.router";
import { workersRouter } from "./workers/workers.router";

export const router = orpc.router({
  health: healthRouter,
  auth: authRouter,
  events: eventsRouter,
  files: filesRouter,
  integrations: integrationsRouter,
  jobs: jobsRouter,
  libraries: librariesRouter,
  rules: rulesRouter,
  scans: scansRouter,
  workers: workersRouter,
});
