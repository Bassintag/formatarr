import { authRouter } from "@/auth/auth.router";
import { eventsRouter } from "@/event/event.router";
import { filesRouter } from "@/file/file.router";
import { healthRouter } from "@/health/health.router";
import { integrationsRouter } from "@/integration/integration.router";
import { jobsRouter } from "@/job/job.router";
import { orpc } from "@/lib/orpc";
import { librariesRouter } from "@/library/library.router";
import { scansRouter } from "@/scan/scan.router";
import { settingsRouter } from "@/settings/settings.router";
import { workersRouter } from "@/worker/worker.router";

export const router = orpc.router({
  health: healthRouter,
  auth: authRouter,
  events: eventsRouter,
  files: filesRouter,
  integrations: integrationsRouter,
  jobs: jobsRouter,
  libraries: librariesRouter,
  scans: scansRouter,
  workers: workersRouter,
  settings: settingsRouter,
});
