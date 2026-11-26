import {
  type FileId,
  type MediaInfo,
  MediaInfoSchema,
} from "@formatarr/contract";
import { eq, inArray } from "drizzle-orm";
import { Semaphore } from "es-toolkit";
import { z } from "zod";
import type { Context } from "@/context";
import { files } from "@/db/schema";

export type ProbeRunner = (path: string) => Promise<unknown>;

type ProbeContext = Pick<Context, "db" | "logger" | "env" | "probe">;

const RawStreamSchema = z.object({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  channels: z.number().optional(),
  bit_rate: z.coerce.number().optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

const RawProbeSchema = z.object({
  format: z
    .object({
      format_name: z.string().optional(),
      duration: z.coerce.number().optional(),
      bit_rate: z.coerce.number().optional(),
    })
    .default({}),
  streams: z.array(RawStreamSchema).default([]),
});

type RawStream = z.infer<typeof RawStreamSchema>;

const PROBE_CHUNK_SIZE = 500;

export function createProbeRunner(ffprobePath: string): ProbeRunner {
  return async (path) => {
    const proc = Bun.spawn(
      [
        ffprobePath,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      throw new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`);
    }
    return JSON.parse(stdout);
  };
}

function language(stream: RawStream) {
  const value = stream.tags?.language;
  return value && value !== "und" ? value : null;
}

const CONTAINER_NAMES: Record<string, string> = {
  matroska: "mkv",
  mov: "mp4",
};

function container(formatName: string | undefined) {
  const name = formatName?.split(",")[0] ?? "unknown";
  return CONTAINER_NAMES[name] ?? name;
}

function videoBitrate({ bit_rate, tags }: RawStream) {
  return bit_rate || Number(tags?.BPS ?? tags?.["BPS-eng"]) || undefined;
}

export function normalizeProbe(raw: unknown): MediaInfo {
  const { format, streams } = RawProbeSchema.parse(raw);
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error("no video stream");

  return MediaInfoSchema.parse({
    container: container(format.format_name),
    durationSeconds: format.duration ?? 0,
    bitrate: format.bit_rate ?? 0,
    video: {
      codec: video.codec_name ?? "unknown",
      width: video.width ?? 0,
      height: video.height ?? 0,
      bitrate: videoBitrate(video) ?? format.bit_rate ?? 0,
    },
    audio: streams
      .filter((s) => s.codec_type === "audio")
      .map((s) => ({
        codec: s.codec_name ?? "unknown",
        language: language(s),
        channels: s.channels ?? 0,
      })),
    subtitles: streams
      .filter((s) => s.codec_type === "subtitle")
      .map((s) => ({
        codec: s.codec_name ?? "unknown",
        language: language(s),
      })),
  });
}

export async function probeFiles(context: ProbeContext, ids: FileId[]) {
  const { db, logger, env, probe } = context;
  const semaphore = new Semaphore(env.PROBE_CONCURRENCY);

  const probeOne = async (row: { id: FileId; path: string }) => {
    await semaphore.acquire();
    try {
      const mediaInfo = normalizeProbe(await probe(row.path));
      db.update(files).set({ mediaInfo }).where(eq(files.id, row.id)).run();
    } catch (error) {
      logger.warn({ err: error, path: row.path }, "probe failed");
      db.update(files)
        .set({ status: "failed", mediaInfo: null })
        .where(eq(files.id, row.id))
        .run();
    } finally {
      semaphore.release();
    }
  };

  for (let start = 0; start < ids.length; start += PROBE_CHUNK_SIZE) {
    const rows = db
      .select({ id: files.id, path: files.path })
      .from(files)
      .where(inArray(files.id, ids.slice(start, start + PROBE_CHUNK_SIZE)))
      .all();
    await Promise.all(rows.map(probeOne));
  }
}
