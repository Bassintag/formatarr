import fsp from "node:fs/promises";
import type {
  File,
  FileId,
  IntegrationId,
  LibraryId,
  LibraryPreview,
  LibraryRule,
  MediaInfo,
} from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, inArray, notInArray } from "drizzle-orm";
import type { Context } from "@/context";
import { integrations, libraryIntegrations, rules } from "@/db/schema";
import { fileOptions } from "@/file/file.options";
import { evaluableFiles, JOB_CHUNK_SIZE } from "@/job/job.lib";
import { buildWhere, type Tx } from "@/lib/db";
import { findMismatches } from "@/rules/rule.lib";

export async function assertDirectory(path: string) {
  const info = await fsp.stat(path).catch(() => null);
  if (!info?.isDirectory()) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Path is not an existing directory: ${path}`,
    });
  }
}

export function setIntegrations(
  tx: Tx,
  libraryId: LibraryId,
  links: { id: IntegrationId }[],
) {
  const integrationIds = [...new Set(links.map((link) => link.id))];
  if (integrationIds.length > 0) {
    const found = tx
      .select({ id: integrations.id })
      .from(integrations)
      .where(inArray(integrations.id, integrationIds))
      .all();
    if (found.length !== integrationIds.length) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Unknown integration id",
      });
    }
  }
  tx.delete(libraryIntegrations)
    .where(eq(libraryIntegrations.libraryId, libraryId))
    .run();
  if (integrationIds.length > 0) {
    tx.insert(libraryIntegrations)
      .values(
        integrationIds.map((integrationId) => ({ libraryId, integrationId })),
      )
      .run();
  }
}

export function setRules(tx: Tx, libraryId: LibraryId, items: LibraryRule[]) {
  const types = items.map((item) => item.type);
  if (types.length === 0) {
    tx.delete(rules).where(eq(rules.libraryId, libraryId)).run();
    return;
  }
  tx.delete(rules)
    .where(and(eq(rules.libraryId, libraryId), notInArray(rules.type, types)))
    .run();
  for (const item of items) {
    tx.insert(rules)
      .values({ ...item, libraryId })
      .onConflictDoUpdate({
        target: [rules.libraryId, rules.type],
        set: { enabled: item.enabled, value: item.value },
      })
      .run();
  }
}

export function assertCron(expression: string | null | undefined) {
  if (!expression) return;
  try {
    Bun.cron.parse(expression);
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: `Invalid cron expression: ${expression}`,
    });
  }
}

export const PREVIEW_LIMIT = 100;

export function previewRules(
  db: Context["db"],
  libraryId: LibraryId,
  draft: LibraryRule[],
): LibraryPreview {
  const active = draft.filter((rule) => rule.enabled);
  const items: LibraryPreview["items"] = [];
  let total = 0;
  let cursor: FileId | null = null;

  while (active.length > 0) {
    const chunk = db.query.files
      .findMany({
        ...fileOptions,
        where: {
          RAW: (table) =>
            buildWhere([
              evaluableFiles(table, libraryId),
              cursor === null ? undefined : gt(table.id, cursor),
            ]),
        },
        orderBy: { id: "asc" },
        limit: JOB_CHUNK_SIZE,
      })
      .sync();
    if (chunk.length === 0) break;
    for (const file of chunk) {
      const mismatches = findMismatches(active, file.mediaInfo as MediaInfo);
      if (mismatches.length === 0) continue;
      total += 1;
      if (items.length < PREVIEW_LIMIT) {
        items.push({ file: file as File, mismatches });
      }
    }
    cursor = chunk[chunk.length - 1]?.id ?? null;
  }

  return { total, items };
}
