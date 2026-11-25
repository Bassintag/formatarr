import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryPublisher } from "@orpc/publisher/memory";
import { createRouterClient } from "@orpc/server";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { Context } from "@/context";
import { createDb } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { createSettings } from "@/lib/settings";
import { router } from "@/router";

export type TestContext = Context & { request: Request };

export function createTestContext(
  overrides: Partial<TestContext> = {},
): TestContext {
  const db = createDb(":memory:");
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });

  const dataDir = mkdtempSync(join(tmpdir(), "formatarr-test-"));

  return {
    env: {
      API_PORT: 0,
      DATA_DIR: dataDir,
      DATABASE_URL: ":memory:",
      FFPROBE_PATH: "ffprobe",
      PROBE_CONCURRENCY: 4,
      LOG_LEVEL: "silent",
    },
    db,
    logger: createLogger("silent"),
    settings: createSettings(dataDir),
    events: new MemoryPublisher(),
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
    schedulers: {
      scan: {
        scan: async () => {},
        update: async () => {},
        remove: () => {},
      },
    },
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
