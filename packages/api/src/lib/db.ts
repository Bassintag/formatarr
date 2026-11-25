import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Page, Pagination } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { and, type SQL, sql } from "drizzle-orm";
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

export type Tx = Parameters<
  Parameters<ReturnType<typeof createDb>["transaction"]>[0]
>[0];

export function paginationOption(pagination: Pagination) {
  return {
    offset: pagination.page * pagination.pageSize,
    limit: pagination.pageSize,
  };
}

export type QueryOptions<
  TableT extends keyof ReturnType<typeof createDb>["query"],
> = Parameters<ReturnType<typeof createDb>["query"][TableT]["findMany"]>[0];

export function toPage<T>(items: T[], totals: { total: number }[]) {
  const { total } = firstOrThrow(totals);
  return { items, total } satisfies Page<T>;
}

export function orThrow<T>(result: T | null | undefined) {
  if (result == null) throw new ORPCError("NOT_FOUND");
  return result;
}

export function firstOrThrow<T>(rows: T[]) {
  const [result] = rows;
  if (result == null) throw new ORPCError("NOT_FOUND");
  return result;
}

export function hasChanges(changes: Record<string, unknown>) {
  return Object.values(changes).some((value) => value !== undefined);
}

export function buildWhere(conditions: (SQL | undefined)[]) {
  return and(...conditions) ?? sql`true`;
}
