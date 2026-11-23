import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    request: new Request("http://localhost"),
    ...overrides,
  };
}

export function createTestCaller(overrides: Partial<TestContext> = {}) {
  const context = createTestContext(overrides);
  const call = createRouterClient(router, { context });
  return { call, context, db: context.db };
}
