import { MemoryPublisher } from "@orpc/publisher/memory";
import { createRouterClient } from "@orpc/server";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { RequestContext } from "@/context";
import { createDb } from "@/lib/db";
import { EnvSchema } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createWorkers } from "@/lib/workers";
import { router } from "@/router";
import { ConfigSchema } from "@/settings/config.schema";

export type TestContext = RequestContext;

export const noopScanScheduler: TestContext["schedulers"]["scan"] = {
  scan: async () => {},
  update: async () => {},
  remove: () => {},
};

export function createTestDb() {
  const db = createDb(":memory:");
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  return db;
}

export function createTestContext(
  overrides: Partial<TestContext> = {},
): TestContext {
  const db = createTestDb();

  let config = ConfigSchema.parse({});

  return {
    env: EnvSchema.parse({
      API_PORT: 0,
      DATA_DIR: "/data",
      DATABASE_URL: ":memory:",
      LOG_LEVEL: "silent",
    }),
    db,
    logger: createLogger("silent"),
    settings: {
      read: async () => config,
      update: async (patch) => {
        config = ConfigSchema.parse({
          auth: { ...config.auth, ...patch.auth },
          jobs: { ...config.jobs, ...patch.jobs },
        });
        return config;
      },
    },
    events: new MemoryPublisher(),
    workers: createWorkers(),
    probe: async () => ({
      format: {
        format_name: "matroska,webm",
        duration: "10",
        bit_rate: "1000",
      },
      streams: [
        { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
      ],
    }),
    schedulers: { scan: noopScanScheduler },
    request: new Request("http://localhost"),
    ...overrides,
  };
}

export function createTestCaller(
  overrides: Partial<TestContext> = {},
  options: { authenticated?: boolean } = {},
) {
  const { authenticated = true } = options;
  const context = createTestContext(overrides);
  const call = createRouterClient(router, {
    context: async () => {
      if (!authenticated || overrides.request) return context;
      const { auth } = await context.settings.read();
      return {
        ...context,
        request: new Request("http://localhost", {
          headers: { "x-api-key": auth.apiKey },
        }),
      };
    },
  });
  return { call, context, db: context.db };
}
