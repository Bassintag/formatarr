import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import type {
  FileId,
  FileStatus,
  LibraryRule,
  MediaInfo,
  RuleType,
} from "@formatarr/contract";
import { eq } from "drizzle-orm";
import {
  files,
  integrations,
  jobRules,
  jobs,
  libraryIntegrations,
  rules,
} from "@/db/schema";
import { createTestCaller, noopScanScheduler } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";
import {
  seedFile,
  seedJob,
  seedLibrary,
  seedRule,
  unknownId,
} from "@/testing/seed";

function setup() {
  const { call, db } = createTestCaller();
  const dir = "/media/lib";
  mockFileSystem({ [join(dir, "file.txt")]: "x" });
  const seedIntegration = (name: string) => {
    const row = db
      .insert(integrations)
      .values({ type: "radarr", name, baseUrl: "http://x", apiKey: "k" })
      .returning({ id: integrations.id })
      .get();
    return row.id;
  };
  return { call, db, dir, seedIntegration };
}

describe("libraries CRUD", () => {
  test("create returns the library with its integration ids", async () => {
    const { call, dir, seedIntegration } = setup();
    const integrationId = seedIntegration("r1");

    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: integrationId }],
    });

    expect(created.integrations).toEqual([{ id: integrationId }]);
    expect(await call.libraries.get({ id: created.id })).toEqual(created);
  });

  test("create rejects invalid paths and unknown integrations", async () => {
    const { call, dir } = setup();
    const file = join(dir, "file.txt");
    const base = { name: "movies", enabled: true, integrations: [] };

    expect(
      call.libraries.create({ ...base, path: join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.libraries.create({ ...base, path: file }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.libraries.create({
        ...base,
        path: dir,
        integrations: [{ id: unknownId }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await call.libraries.list({ page: 0, pageSize: 10 })).total).toBe(
      0,
    );
  });

  test("list paginates", async () => {
    const { call, dir } = setup();
    for (const name of ["a", "b", "c"]) {
      await call.libraries.create({
        name,
        path: dir,
        enabled: true,
        integrations: [],
      });
    }

    const page = await call.libraries.list({ page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((l) => l.name)).toEqual(["c"]);
  });

  test("update changes only provided fields and replaces integrations", async () => {
    const { call, dir, seedIntegration } = setup();
    const first = seedIntegration("r1");
    const second = seedIntegration("r2");
    const { id } = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: first }],
    });

    const renamed = await call.libraries.update({ id, name: "films" });
    expect(renamed.name).toBe("films");
    expect(renamed.path).toBe(dir);
    expect(renamed.integrations).toEqual([{ id: first }]);

    const relinked = await call.libraries.update({
      id,
      integrations: [{ id: second }],
    });
    expect(relinked.integrations).toEqual([{ id: second }]);

    const cleared = await call.libraries.update({ id, integrations: [] });
    expect(cleared.integrations).toEqual([]);

    expect(
      call.libraries.update({ id, path: join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("remove deletes the library and its links", async () => {
    const { call, db, dir, seedIntegration } = setup();
    const integrationId = seedIntegration("r1");
    const { id } = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [{ id: integrationId }],
    });

    await call.libraries.remove({ id });

    expect(call.libraries.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.select().from(libraryIntegrations).all()).toEqual([]);
  });

  test("unknown ids are not found", async () => {
    const { call } = setup();
    const id = unknownId;

    expect(call.libraries.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.update({ id, name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.update({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.libraries.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("libraries scan scheduling", () => {
  function setupScheduler() {
    const update = mock(async () => {});
    const remove = mock(() => {});
    const { call, db } = createTestCaller({
      schedulers: { scan: { ...noopScanScheduler, update, remove } },
    });
    const dir = "/media/lib";
    mockFileSystem({ [join(dir, "file.txt")]: "x" });
    return { call, db, dir, update, remove };
  }

  test("scanCron and watch default to null and false", async () => {
    const { call, dir } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    expect(created.scanCron).toBeNull();
    expect(created.watch).toBe(false);
  });

  test("create and update persist scheduling and notify the scheduler", async () => {
    const { call, dir, update } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      scanCron: "*/5 * * * *",
      watch: true,
      integrations: [],
    });
    expect(created.scanCron).toBe("*/5 * * * *");
    expect(created.watch).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);

    const updated = await call.libraries.update({
      id: created.id,
      scanCron: null,
      watch: false,
    });
    expect(updated.scanCron).toBeNull();
    expect(updated.watch).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
  });

  test("update without scheduling fields keeps them", async () => {
    const { call, dir } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      scanCron: "*/5 * * * *",
      watch: true,
      integrations: [],
    });
    const renamed = await call.libraries.update({
      id: created.id,
      name: "films",
    });
    expect(renamed.scanCron).toBe("*/5 * * * *");
    expect(renamed.watch).toBe(true);
  });

  test("invalid cron expressions are rejected", async () => {
    const { call, dir, update } = setupScheduler();
    expect(
      call.libraries.create({
        name: "movies",
        path: dir,
        enabled: true,
        scanCron: "nope",
        integrations: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    expect(
      call.libraries.update({ id: created.id, scanCron: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("remove unschedules the library", async () => {
    const { call, dir, remove } = setupScheduler();
    const created = await call.libraries.create({
      name: "movies",
      path: dir,
      enabled: true,
      integrations: [],
    });
    await call.libraries.remove({ id: created.id });
    expect(remove).toHaveBeenCalledWith(created.id);
  });
});

const mediaInfo: MediaInfo = {
  container: "mp4",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080, bitrate: 4500 },
  audio: [{ codec: "aac", language: "eng", channels: 2 }],
  subtitles: [],
};

const sample: Record<RuleType, LibraryRule> = {
  container: { enabled: true, type: "container", value: "mkv" },
  videoCodec: { enabled: true, type: "videoCodec", value: "hevc" },
  maxResolution: { enabled: true, type: "maxResolution", value: 1080 },
  maxBitrate: { enabled: true, type: "maxBitrate", value: 8000 },
  audioCodec: { enabled: true, type: "audioCodec", value: "aac" },
  subtitleLanguages: {
    enabled: true,
    type: "subtitleLanguages",
    value: ["eng"],
  },
};

describe("libraries rules", () => {
  function harness() {
    const { call, db } = createTestCaller();
    const library = seedLibrary(db, { name: "movies" }).id;
    const file = (status: FileStatus, values = {}) =>
      seedFile(db, library, { status, mediaInfo, ...values }).id;
    const statusOf = (id: FileId) =>
      db.select().from(files).where(eq(files.id, id)).get()?.status;
    const jobCount = () => db.select().from(jobs).all().length;
    const types = async () =>
      (await call.libraries.get({ id: library })).rules.map((r) => r.type);
    return { call, db, library, file, statusOf, jobCount, types };
  }

  test("create embeds the given rules and defaults to none", async () => {
    const { call } = createTestCaller();
    mockFileSystem({ "/media/lib/file.txt": "x" });
    const base = {
      name: "m",
      path: "/media/lib",
      enabled: true,
      integrations: [],
    };

    const empty = await call.libraries.create(base);
    const created = await call.libraries.create({
      ...base,
      rules: [sample.container, sample.maxBitrate],
    });

    expect(empty.rules).toEqual([]);
    expect(created.rules.map((r) => r.type)).toEqual([
      "container",
      "maxBitrate",
    ]);
    expect(created.rules[0]).toMatchObject({
      libraryId: created.id,
      enabled: true,
      value: "mkv",
    });
  });

  test("create and update reject duplicate rule types", async () => {
    const { call, library } = harness();
    mockFileSystem({ "/media/lib/file.txt": "x" });

    expect(
      call.libraries.create({
        name: "m",
        path: "/media/lib",
        enabled: true,
        integrations: [],
        rules: [sample.container, sample.container],
      }),
    ).rejects.toThrow();
    expect(
      call.libraries.update({
        id: library,
        rules: [sample.container, sample.container],
      }),
    ).rejects.toThrow();
  });

  test("update replaces rules and keeps ids of unchanged types", async () => {
    const { call, library, types } = harness();
    const first = await call.libraries.update({
      id: library,
      rules: [sample.container, sample.maxBitrate],
    });
    const [container, bitrate] = first.rules;

    const second = await call.libraries.update({
      id: library,
      rules: [
        { ...sample.maxBitrate, value: 1000, enabled: false },
        sample.videoCodec,
      ],
    });

    expect(await types()).toEqual(["maxBitrate", "videoCodec"]);
    expect(second.rules[0]).toMatchObject({
      id: bitrate?.id,
      enabled: false,
      value: 1000,
    });
    expect(second.rules.map((r) => r.id)).not.toContain(container?.id);

    const cleared = await call.libraries.update({ id: library, rules: [] });
    expect(cleared.rules).toEqual([]);
  });

  test("update without rules keeps them and does not re-evaluate", async () => {
    const { call, library, file, statusOf, jobCount } = harness();
    await call.libraries.update({ id: library, rules: [sample.container] });
    const id = file("done");

    const renamed = await call.libraries.update({ id: library, name: "films" });

    expect(renamed.rules).toHaveLength(1);
    expect(statusOf(id)).toBe("done");
    expect(jobCount()).toBe(0);
  });

  test("update keeps job rules of unchanged types and drops removed ones", async () => {
    const { call, db, library, file } = harness();
    const keep = seedRule(db, library, { type: "container", value: "mkv" });
    const drop = seedRule(db, library, { type: "maxBitrate", value: 1 });
    const job = seedJob(db, file("queued"), [keep.id, drop.id]);

    await call.libraries.update({ id: library, rules: [sample.container] });

    expect(
      db.select().from(jobRules).where(eq(jobRules.jobId, job.id)).all(),
    ).toMatchObject([{ ruleId: keep.id }]);
    expect(
      db
        .select()
        .from(rules)
        .all()
        .map((r) => r.id),
    ).toEqual([keep.id]);
  });

  test("update queues unmet pending and done files", async () => {
    const { call, library, file, statusOf, jobCount } = harness();
    const pending = file("pending");
    const done = file("done");

    await call.libraries.update({ id: library, rules: [sample.container] });

    expect(statusOf(pending)).toBe("queued");
    expect(statusOf(done)).toBe("queued");
    expect(jobCount()).toBe(2);
  });

  test("update leaves satisfied files done", async () => {
    const { call, library, file, statusOf, jobCount } = harness();
    const pending = file("pending");
    const done = file("done");

    await call.libraries.update({
      id: library,
      rules: [{ enabled: true, type: "container", value: "mp4" }],
    });

    expect(statusOf(pending)).toBe("done");
    expect(statusOf(done)).toBe("done");
    expect(jobCount()).toBe(0);
  });

  test("update re-evaluates against changed values, disabled and removed rules", async () => {
    const { call, library, file, statusOf, jobCount } = harness();
    await call.libraries.update({
      id: library,
      rules: [{ enabled: true, type: "maxBitrate", value: 8000 }],
    });
    const id = file("pending");
    await call.libraries.update({ id: library, rules: [sample.maxBitrate] });
    expect(statusOf(id)).toBe("done");

    await call.libraries.update({
      id: library,
      rules: [{ enabled: true, type: "maxBitrate", value: 1000 }],
    });
    expect(statusOf(id)).toBe("queued");
    expect(jobCount()).toBe(1);

    const other = file("done");
    await call.libraries.update({ id: library, rules: [] });
    expect(statusOf(other)).toBe("done");
  });

  test("disabled rules send pending files straight to done", async () => {
    const { call, library, file, statusOf } = harness();
    const id = file("pending");

    await call.libraries.update({
      id: library,
      rules: [{ ...sample.container, enabled: false }],
    });

    expect(statusOf(id)).toBe("done");
  });

  test("queued, processing, ignored and unprobed files are untouched", async () => {
    const { call, library, file, statusOf, jobCount } = harness();
    const queued = file("queued");
    const processing = file("processing");
    const ignored = file("done", { ignored: true });
    const unprobed = file("pending", { mediaInfo: null });

    await call.libraries.update({ id: library, rules: [sample.container] });

    expect(statusOf(queued)).toBe("queued");
    expect(statusOf(processing)).toBe("processing");
    expect(statusOf(ignored)).toBe("done");
    expect(statusOf(unprobed)).toBe("pending");
    expect(jobCount()).toBe(0);
  });

  test("other libraries are not re-evaluated", async () => {
    const { call, db, library } = harness();
    const other = seedLibrary(db, { name: "other" }).id;
    const id = seedFile(db, other, { status: "done", mediaInfo }).id;

    await call.libraries.update({ id: library, rules: [sample.container] });

    expect(db.select().from(files).where(eq(files.id, id)).get()?.status).toBe(
      "done",
    );
  });
});

describe("libraries previews", () => {
  function harness() {
    const { call, db } = createTestCaller();
    const library = seedLibrary(db, { name: "movies" }).id;
    const file = (status: FileStatus, values = {}) =>
      seedFile(db, library, { status, mediaInfo, ...values }).id;
    return { call, db, library, file };
  }

  test("lists the files breaking the draft rules with their reasons", async () => {
    const { call, library, file } = harness();
    const broken = file("pending");
    file("pending", {
      mediaInfo: { ...mediaInfo, container: "mkv" },
    });

    const preview = await call.libraries.createPreview({
      id: library,
      rules: [sample.container, sample.maxBitrate],
    });

    expect(preview.total).toBe(1);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.file.id).toBe(broken);
    expect(preview.items[0]?.mismatches).toEqual([
      {
        rule: { type: "container", value: "mkv" },
        reason: "Container is mp4, expected mkv",
      },
    ]);
  });

  test("ignores the saved rules and the disabled draft rules", async () => {
    const { call, db, library, file } = harness();
    file("pending");
    seedRule(db, library, { type: "container", value: "mkv" });

    const preview = await call.libraries.createPreview({
      id: library,
      rules: [{ ...sample.container, enabled: false }],
    });

    expect(preview).toEqual({ total: 0, items: [] });
  });

  test("includes done files and skips the other ones", async () => {
    const { call, library, file } = harness();
    const done = file("done");
    const pending = file("pending");
    file("queued");
    file("processing");
    file("failed");
    file("pending", { ignored: true });
    file("pending", { mediaInfo: null });

    const preview = await call.libraries.createPreview({
      id: library,
      rules: [sample.container],
    });

    expect(preview.items.map((item) => item.file.id)).toEqual([done, pending]);
    expect(preview.total).toBe(2);
  });

  test("caps the items at 100 but counts every match", async () => {
    const { call, library, file } = harness();
    for (let i = 0; i < 520; i += 1) file("pending");

    const preview = await call.libraries.createPreview({
      id: library,
      rules: [sample.container],
    });

    expect(preview.total).toBe(520);
    expect(preview.items).toHaveLength(100);
  });

  test("only looks at the files of the library", async () => {
    const { call, db, library, file } = harness();
    file("pending");
    const other = seedLibrary(db, { name: "other" }).id;
    seedFile(db, other, { status: "pending", mediaInfo });

    const preview = await call.libraries.createPreview({
      id: library,
      rules: [sample.container],
    });

    expect(preview.total).toBe(1);
  });

  test("unknown library is not found", async () => {
    const { call } = harness();
    expect(
      call.libraries.createPreview({
        id: unknownId,
        rules: [],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("creates no job and leaves files untouched", async () => {
    const { call, db, library, file } = harness();
    const pending = file("pending");
    const done = file("done");

    await call.libraries.createPreview({
      id: library,
      rules: [sample.container],
    });

    expect(db.select().from(jobs).all()).toEqual([]);
    const statuses = db
      .select({ id: files.id, status: files.status })
      .from(files)
      .orderBy(files.id)
      .all();
    expect(statuses).toEqual([
      { id: pending, status: "pending" },
      { id: done, status: "done" },
    ]);
  });
});
