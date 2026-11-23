import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { relations } from "@/db/relations";

export function createDb(databaseUrl: string) {
  if (databaseUrl !== ":memory:") {
    mkdirSync(dirname(databaseUrl), { recursive: true });
  }
  const client = new Database(databaseUrl, { create: true });
  client.run("PRAGMA foreign_keys = ON");
  return drizzle({ client, relations });
}
