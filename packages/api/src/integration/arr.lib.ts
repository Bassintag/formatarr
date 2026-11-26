import type { IntegrationType, JobId, LibraryId } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { trimEnd } from "es-toolkit";
import { z } from "zod";
import type { Context } from "@/context";
import type { integrations } from "@/db/schema";
import { integrationOptions } from "@/integration/integration.options";
import { appendJobLog } from "@/log/log.lib";

type Connection = Pick<
  typeof integrations.$inferSelect,
  "type" | "baseUrl" | "apiKey"
>;

const TIMEOUT_MS = 30_000;

const ARR_APPS = {
  radarr: { resource: "movie", command: "RescanMovie", idKey: "movieId" },
  sonarr: { resource: "series", command: "RescanSeries", idKey: "seriesId" },
} satisfies Record<IntegrationType, unknown>;

const StatusSchema = z.object({ version: z.string() });
const MediaListSchema = z.array(z.object({ id: z.number(), path: z.string() }));

async function arrRequest(
  { baseUrl, apiKey }: Connection,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${trimEnd(baseUrl, "/")}/api/v3/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function testConnection(connection: Connection) {
  try {
    return StatusSchema.parse(await arrRequest(connection, "system/status"));
  } catch (error) {
    throw new ORPCError("BAD_GATEWAY", {
      message: "Connection failed",
      cause: error,
    });
  }
}

async function rescanMedia(connection: Connection, filePath: string) {
  const { resource, command, idKey } = ARR_APPS[connection.type];
  const media = MediaListSchema.parse(
    await arrRequest(connection, resource),
  ).find(({ path }) => filePath.startsWith(`${trimEnd(path, "/")}/`));
  if (!media) throw new Error(`No ${resource} matches ${filePath}`);
  await arrRequest(connection, "command", {
    name: command,
    [idKey]: media.id,
  });
}

export async function rescanIntegrations(
  { db, logger }: Pick<Context, "db" | "logger">,
  jobId: JobId,
  file: { libraryId: LibraryId; path: string },
) {
  const linked = db.query.integrations
    .findMany({
      ...integrationOptions,
      where: { enabled: true, libraries: { id: file.libraryId } },
    })
    .sync();
  await Promise.all(
    linked.map(async (integration) => {
      try {
        await rescanMedia(integration, file.path);
      } catch (error) {
        const { id, name } = integration;
        logger.warn({ err: error, jobId, integrationId: id }, "rescan failed");
        const reason = error instanceof Error ? error.message : String(error);
        appendJobLog(db, jobId, `Rescan failed on ${name}: ${reason}`);
      }
    }),
  );
}
