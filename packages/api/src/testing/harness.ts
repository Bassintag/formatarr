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
      LOG_LEVEL: "silent",
    },
    db,
    logger: createLogger("silent"),
    settings: createSettings(dataDir),
    events: new MemoryPublisher(),
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
