import type { AppEvent } from "@formatarr/contract";
import { MemoryPublisher } from "@orpc/publisher/memory";
import { createDb } from "@/lib/db";
import { createEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createSettings } from "@/lib/settings";
import { createWorkers } from "@/lib/workers";
import { createProbeRunner } from "@/probe/probe.lib";
import { createScanScheduler } from "@/scan/scan.scheduler";
import { requeueJobs } from "@/task/task.lib";

export function createPrimitiveContext() {
  const env = createEnv();

  return {
    env,
    db: createDb(env.DATABASE_URL),
    logger: createLogger(env.LOG_LEVEL),
    settings: createSettings(env.DATA_DIR),
    events: new MemoryPublisher<{ event: AppEvent }>(),
    probe: createProbeRunner(env.FFPROBE_PATH),
    workers: createWorkers(),
  };
}

export type PrimitiveContext = ReturnType<typeof createPrimitiveContext>;

export async function createContext() {
  const context = createPrimitiveContext();
  context.db.transaction((tx) => requeueJobs(tx));

  return {
    ...context,
    schedulers: {
      scan: await createScanScheduler(context),
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

export type RequestContext = Context & { request: Request };
