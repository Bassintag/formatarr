import type { AppEvent } from "@formatarr/contract";
import { MemoryPublisher } from "@orpc/publisher/memory";
import { createDb } from "@/lib/db";
import { createEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createSettings } from "@/lib/settings";

export function createContext() {
  const env = createEnv();

  return {
    env,
    db: createDb(env.DATABASE_URL),
    logger: createLogger(env.LOG_LEVEL),
    settings: createSettings(env.DATA_DIR),
    events: new MemoryPublisher<{ event: AppEvent }>(),
  };
}

export type Context = ReturnType<typeof createContext>;

export type RequestContext = Context & { request: Request };
