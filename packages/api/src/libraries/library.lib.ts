import { stat } from "node:fs/promises";
import type { IntegrationId, LibraryId } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { integrations, libraryIntegrations } from "@/db/schema";
import type { Tx } from "@/lib/db";

export async function assertDirectory(path: string) {
  const info = await stat(path).catch(() => null);
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
