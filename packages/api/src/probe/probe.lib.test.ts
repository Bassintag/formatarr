import { describe, expect, test } from "bun:test";
import { files, libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestContext } from "@/testing/harness";
import { advance } from "@/testing/timers";
import { normalizeProbe, probeFiles } from "./probe.lib";

const raw = {
  format: { format_name: "matroska,webm", duration: "12.5", bit_rate: "4000" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080 },
    {
      codec_type: "audio",
      codec_name: "aac",
      channels: 6,
      tags: { language: "eng" },
    },
    { codec_type: "audio", codec_name: "ac3", channels: 2 },
    {
      codec_type: "subtitle",
      codec_name: "subrip",
      tags: { language: "und" },
    },
  ],
};

async function setup(count: number) {
  const context = createTestContext();
  const library = await firstOrThrow(
    context.db
      .insert(libraries)
      .values({ name: "lib", path: "/x" })
      .returning({ id: libraries.id }),
  );
  const ids = context.db
    .insert(files)
    .values(
      Array.from({ length: count }, (_, i) => ({
        libraryId: library.id,
        path: `/x/${i}.mkv`,
        size: 1,
      })),
    )
    .returning({ id: files.id })
    .all()
    .map((r) => r.id);
  return { context, ids };
}

describe("normalizeProbe", () => {
  test("normalizes streams and format", () => {
    expect(normalizeProbe(raw)).toEqual({
      container: "matroska",
      durationSeconds: 12.5,
      bitrate: 4000,
      video: { codec: "h264", width: 1920, height: 1080 },
      audio: [
        { codec: "aac", language: "eng", channels: 6 },
        { codec: "ac3", language: null, channels: 2 },
      ],
      subtitles: [{ codec: "subrip", language: null }],
    });
  });

  test("throws without a video stream", () => {
    expect(() =>
      normalizeProbe({ format: {}, streams: [{ codec_type: "audio" }] }),
    ).toThrow();
  });
});

describe("probeFiles", () => {
  test("stores media info and publishes events", async () => {
    const { context, ids } = await setup(2);
    await probeFiles({ ...context, probe: async () => raw }, ids);
    const rows = context.db.select().from(files).all();
    expect(rows.every((r) => r.mediaInfo?.container === "matroska")).toBe(true);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  test("flags files whose probe fails", async () => {
    const { context, ids } = await setup(2);
    await probeFiles(
      {
        ...context,
        probe: async (path) => {
          if (path.endsWith("0.mkv")) throw new Error("corrupt");
          return raw;
        },
      },
      ids,
    );
    const rows = context.db.select().from(files).all();
    expect(rows.find((r) => r.path.endsWith("0.mkv"))?.status).toBe("failed");
    expect(rows.find((r) => r.path.endsWith("1.mkv"))?.status).toBe("pending");
  });

  test("respects the concurrency limit", async () => {
    const { context, ids } = await setup(10);
    let running = 0;
    let peak = 0;
    const done = probeFiles(
      {
        ...context,
        env: { ...context.env, PROBE_CONCURRENCY: 3 },
        probe: async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
          return raw;
        },
      },
      ids,
    );
    for (let i = 0; i < 10; i++) await advance(5);
    await done;
    expect(peak).toBe(3);
  });
});
