import type { AppEvent } from "@formatarr/contract";
import { MemoryPublisher } from "@orpc/publisher/memory";
import { createDb } from "@/lib/db";
import { createEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createSettings } from "@/lib/settings";
import { createProbeRunner } from "@/probe/probe.lib";
import { createScanScheduler } from "@/scan/scan.scheduler";

export function createPrimitiveContext() {
  const env = createEnv();

  return {
    env,
    db: createDb(env.DATABASE_URL),
    logger: createLogger(env.LOG_LEVEL),
    settings: createSettings(env.DATA_DIR),
    events: new MemoryPublisher<{ event: AppEvent }>(),
    probe: createProbeRunner(env.FFPROBE_PATH),
  };
}

export type PrimitiveContext = ReturnType<typeof createPrimitiveContext>;

export async function createContext() {
  const context = createPrimitiveContext();

  return {
    ...context,
    schedulers: {
      scan: await createScanScheduler(context),
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

export type RequestContext = Context & { request: Request };
