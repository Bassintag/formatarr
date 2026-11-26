import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type {
  FileId,
  JobId,
  LibraryId,
  MediaInfo,
  RuleValue,
} from "@formatarr/contract";
import { asc, eq } from "drizzle-orm";
import { files, jobRules, jobs } from "@/db/schema";
import { createJobsForFiles } from "@/job/job.lib";
import { scanLibrary } from "@/scan/scan.lib";
import { createTestContext } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";
import { seedFile, seedLibrary, seedRule } from "@/testing/seed";

const mediaInfo: MediaInfo = {
  container: "mkv",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080, bitrate: 4500 },
  audio: [
    { codec: "aac", language: "eng", channels: 2 },
    { codec: "ac3", language: null, channels: 6 },
  ],
  subtitles: [],
};

async function setupJobs() {
  const context = createTestContext();
  const library = seedLibrary(context.db, { path: "/tmp/lib" });
  const addRule = (
    rule: RuleValue,
    options: { enabled?: boolean; libraryId?: LibraryId } = {},
  ) =>
    seedRule(context.db, options.libraryId ?? library.id, {
      enabled: options.enabled ?? true,
      ...rule,
    });
  const addFile = (
    name: string,
    values: Partial<typeof files.$inferInsert> = {},
  ) =>
    seedFile(context.db, library.id, {
      path: `/tmp/lib/${name}`,
      size: 1000,
      mediaInfo,
      ...values,
    });
  const allJobs = () => context.db.select().from(jobs).all();
  const fileStatus = (id: FileId) =>
    context.db.select().from(files).where(eq(files.id, id)).get()?.status;
  const jobRuleIds = (jobId?: JobId) =>
    context.db
      .select({ ruleId: jobRules.ruleId })
      .from(jobRules)
      .where(eq(jobRules.jobId, jobId as JobId))
      .orderBy(asc(jobRules.ruleId))
      .all()
      .map((row) => row.ruleId);
  return {
    context,
    library,
    addRule,
    addFile,
    allJobs,
    fileStatus,
    jobRuleIds,
  };
}

describe("createJobsForFiles", () => {
  test("creates a queued job and queues the file", async () => {
    const { context, addRule, addFile, allJobs, fileStatus, jobRuleIds } =
      await setupJobs();
    const rule = await addRule({ type: "container", value: "mp4" });
    const f = await addFile("a.mkv");
    const received: unknown[] = [];
    const publish = context.events.publish.bind(context.events);
    context.events.publish = (async (name: "event", payload: unknown) => {
      received.push(payload);
      return publish(name, payload as never);
    }) as typeof context.events.publish;

    const count = await createJobsForFiles(context, [f.id]);
    const [job] = allJobs();
    expect(count).toEqual([job?.id as JobId]);
    expect(job).toMatchObject({ fileId: f.id, status: "queued" });
    expect(jobRuleIds(job?.id)).toEqual([rule.id]);
    expect(fileStatus(f.id)).toBe("queued");

    expect(received).toEqual([
      { type: "job.status", id: job?.id, status: "queued" },
    ]);
  });

  test("one job carries every unmet rule and skips satisfied and disabled ones", async () => {
    const { context, addRule, addFile, allJobs, jobRuleIds } =
      await setupJobs();
    await addRule({ type: "container", value: "mkv" });
    const codec = await addRule({ type: "videoCodec", value: "hevc" });
    const bitrate = await addRule({ type: "maxBitrate", value: 1000 });
    await addRule({ type: "maxResolution", value: 480 }, { enabled: false });
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    const created = allJobs();
    expect(created).toHaveLength(1);
    expect(jobRuleIds(created[0]?.id)).toEqual([codec.id, bitrate.id]);
  });

  test("marks the file done without a job when every rule is satisfied", async () => {
    const { context, addRule, addFile, allJobs, fileStatus } =
      await setupJobs();
    await addRule({ type: "container", value: "mkv" });
    await addRule({ type: "subtitleLanguages", value: ["eng"] });
    const f = await addFile("a.mkv");
    expect(await createJobsForFiles(context, [f.id])).toEqual([]);
    expect(allJobs()).toHaveLength(0);
    expect(fileStatus(f.id)).toBe("done");
  });

  test("marks the file done when the library has no enabled rule", async () => {
    const { context, addRule, addFile, fileStatus } = await setupJobs();
    await addRule({ type: "container", value: "mp4" }, { enabled: false });
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    expect(fileStatus(f.id)).toBe("done");
  });

  test("skips ignored, done, failed and unprobed files", async () => {
    const { context, addRule, addFile, allJobs, fileStatus } =
      await setupJobs();
    await addRule({ type: "container", value: "mp4" });
    const raw = await addFile("raw.mkv", { mediaInfo: null });
    const ids = [
      (await addFile("ignored.mkv", { ignored: true })).id,
      (await addFile("done.mkv", { status: "done" })).id,
      (await addFile("failed.mkv", { status: "failed" })).id,
      raw.id,
    ];
    expect(await createJobsForFiles(context, ids)).toEqual([]);
    expect(allJobs()).toHaveLength(0);
    expect(fileStatus(raw.id)).toBe("pending");
  });

  test("does not create duplicates on a second run", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    await addRule({ type: "container", value: "mp4" });
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    expect(await createJobsForFiles(context, [f.id])).toEqual([]);
    expect(allJobs()).toHaveLength(1);
  });

  test("ignores rules from other libraries", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    const other = seedLibrary(context.db, { name: "other" });
    await addRule({ type: "container", value: "mp4" }, { libraryId: other.id });
    const f = await addFile("a.mkv");
    expect(await createJobsForFiles(context, [f.id])).toEqual([]);
    expect(allJobs()).toHaveLength(0);
  });
});

describe("scanLibrary integration", () => {
  test("creates jobs for probed files", async () => {
    const context = createTestContext();
    const root = "/media";
    mockFileSystem({ [join(root, "movie.mkv")]: "12345" });
    const library = seedLibrary(context.db, { path: root });
    seedRule(context.db, library.id, { type: "container", value: "mp4" });
    await scanLibrary(context, library.id);
    const created = context.db.select().from(jobs).all();
    expect(created).toHaveLength(1);
    expect(context.db.select().from(files).get()?.status).toBe("queued");
  });
});
