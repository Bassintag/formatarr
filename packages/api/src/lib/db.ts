import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Page, Pagination } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
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

export function paginationOption(pagination: Pagination) {
  return {
    offset: pagination.page * pagination.pageSize,
    limit: pagination.pageSize,
  };
}

export type QueryOptions<
  TableT extends keyof ReturnType<typeof createDb>["query"],
> = Parameters<ReturnType<typeof createDb>["query"][TableT]["findMany"]>[0];

export async function toPage<T>(
  itemsPromise: Promise<T[]>,
  totalPromise: Promise<{ total: number }[]>,
) {
  const [items, { total }] = await Promise.all([
    itemsPromise,
    firstOrThrow(totalPromise),
  ]);
  return { items, total } satisfies Page<T>;
}

export async function orThrow<T>(promise: Promise<T | null>) {
  const result = await promise;
  if (result == null) throw new ORPCError("NOT_FOUND");
  return result;
}

export async function firstOrThrow<T>(promise: Promise<T[]>) {
  const [result] = await promise;
  if (result == null) throw new ORPCError("NOT_FOUND");
  return result;
}
