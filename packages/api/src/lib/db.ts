import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/db/schema";

export function createDb(databaseUrl: string) {
  if (databaseUrl !== ":memory:") {
    mkdirSync(dirname(databaseUrl), { recursive: true });
  }
  return drizzle(new Database(databaseUrl, { create: true }), { schema });
}

export type Db = ReturnType<typeof createDb>;
