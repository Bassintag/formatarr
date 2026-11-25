import { describe, expect, test } from "bun:test";
import type {
  FileId,
  FileStatus,
  LibraryId,
  MediaInfo,
  RuleType,
  RuleValue,
} from "@formatarr/contract";
import { eq } from "drizzle-orm";
import { files, jobs } from "@/db/schema";
import { createTestCaller } from "@/testing/harness";
import { seedFile, seedLibrary, unknownId } from "@/testing/seed";

const mediaInfo: MediaInfo = {
  container: "matroska",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080 },
  audio: [{ codec: "aac", language: "eng", channels: 2 }],
  subtitles: [],
};

const sample: Record<RuleType, RuleValue> = {
  container: { type: "container", value: "mkv" },
  videoCodec: { type: "videoCodec", value: "hevc" },
  maxResolution: { type: "maxResolution", value: 1080 },
  maxBitrate: { type: "maxBitrate", value: 8000 },
  audioCodec: { type: "audioCodec", value: "aac" },
  audioLanguages: { type: "audioLanguages", value: ["eng"] },
  subtitleLanguages: { type: "subtitleLanguages", value: ["eng"] },
};

function setup() {
  const { call, db } = createTestCaller();
  const library = (name: string) => seedLibrary(db, { name }).id;
  const rule = (libraryId: LibraryId, type: RuleType = "container") => ({
    libraryId,
    enabled: true,
    ...sample[type],
  });
  const types = async (libraryId: LibraryId) =>
    (await call.rules.list({ libraryId, page: 0, pageSize: 50 })).items.map(
      (r) => r.type,
    );
  return { call, seedLibrary: library, rule, types };
}

describe("rules CRUD", () => {
  test("create and get", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = seedLibrary("movies");

    const created = await call.rules.create(rule(library));

    expect(await call.rules.get({ id: created.id })).toEqual(created);
  });

  test("create rejects an unknown library", async () => {
    const { call, rule } = setup();
    expect(call.rules.create(rule(unknownId))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("list filters by library and paginates", async () => {
    const { call, seedLibrary, rule } = setup();
    const one = seedLibrary("one");
    const two = seedLibrary("two");
    for (const type of ["container", "videoCodec", "audioCodec"] as const)
      await call.rules.create(rule(one, type));
    await call.rules.create(rule(two));

    const all = await call.rules.list({ page: 0, pageSize: 50 });
    const filtered = await call.rules.list({
      libraryId: one,
      page: 1,
      pageSize: 2,
    });

    expect(all.total).toBe(4);
    expect(filtered.total).toBe(3);
    expect(filtered.items.map((r) => r.type)).toEqual(["audioCodec"]);
  });

  test("set replaces the rule", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = seedLibrary("movies");
    const created = await call.rules.create(rule(library, "maxBitrate"));

    const updated = await call.rules.set({
      id: created.id,
      enabled: false,
      type: "maxBitrate",
      value: 5000,
    });

    expect(updated).toEqual({
      ...created,
      enabled: false,
      value: 5000,
    } as typeof created);
    expect(await call.rules.get({ id: created.id })).toEqual(updated);
  });

  test("set and get of a missing rule return NOT_FOUND", async () => {
    const { call } = setup();
    expect(call.rules.get({ id: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      call.rules.set({
        id: unknownId,
        enabled: false,
        type: "container",
        value: "mkv",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("remove deletes the rule", async () => {
    const { call, seedLibrary, rule, types } = setup();
    const library = seedLibrary("movies");
    await call.rules.create(rule(library));
    const b = await call.rules.create(rule(library, "videoCodec"));

    await call.rules.remove({ id: b.id });

    expect(await types(library)).toEqual(["container"]);
    expect(call.rules.remove({ id: b.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("create rejects a value that does not match the type", async () => {
    const { call, seedLibrary } = setup();
    const library = seedLibrary("movies");

    expect(
      call.rules.create({
        libraryId: library,
        enabled: true,
        type: "maxBitrate",
        value: "high",
      } as never),
    ).rejects.toThrow();
  });

  test("create rejects a second rule of the same type in a library", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = seedLibrary("movies");
    await call.rules.create(rule(library));

    expect(call.rules.create(rule(library))).rejects.toThrow();
    expect(await call.rules.create(rule(seedLibrary("other")))).toBeDefined();
  });

  test("set rejects a value that does not match the type", async () => {
    const { call, seedLibrary, rule } = setup();
    const library = seedLibrary("movies");
    const created = await call.rules.create(rule(library, "maxBitrate"));

    expect(
      call.rules.set({
        id: created.id,
        enabled: true,
        type: "maxBitrate",
        value: ["eng"],
      } as never),
    ).rejects.toThrow();
  });
});

describe("rules re-evaluation", () => {
  function harness() {
    const { call, db } = createTestCaller();
    const library = seedLibrary(db, { name: "movies" }).id;
    const file = (status: FileStatus, values = {}) =>
      seedFile(db, library, { status, mediaInfo, ...values }).id;
    const statusOf = (id: FileId) =>
      db.select().from(files).where(eq(files.id, id)).get()?.status;
    const jobCount = () => db.select().from(jobs).all().length;
    const rule = (value: RuleValue) => ({
      libraryId: library,
      enabled: true,
      ...value,
    });
    return { call, db, library, file, statusOf, jobCount, rule };
  }

  test("create queues unmet pending and done files", async () => {
    const { call, file, statusOf, jobCount, rule } = harness();
    const pending = file("pending");
    const done = file("done");

    await call.rules.create(rule(sample.container));

    expect(statusOf(pending)).toBe("queued");
    expect(statusOf(done)).toBe("queued");
    expect(jobCount()).toBe(2);
  });

  test("create leaves satisfied files done", async () => {
    const { call, file, statusOf, jobCount, rule } = harness();
    const pending = file("pending");
    const done = file("done");

    await call.rules.create(rule({ type: "container", value: "matroska" }));

    expect(statusOf(pending)).toBe("done");
    expect(statusOf(done)).toBe("done");
    expect(jobCount()).toBe(0);
  });

  test("set re-evaluates against the new value", async () => {
    const { call, file, statusOf, jobCount, rule } = harness();
    const created = await call.rules.create(
      rule({ type: "maxBitrate", value: 8000 }),
    );
    const id = file("pending");
    await call.rules.create(rule({ type: "container", value: "matroska" }));
    expect(statusOf(id)).toBe("done");

    await call.rules.set({
      id: created.id,
      enabled: true,
      type: "maxBitrate",
      value: 1000,
    });

    expect(statusOf(id)).toBe("queued");
    expect(jobCount()).toBe(1);
  });

  test("disabling a rule re-evaluates and deleting does too", async () => {
    const { call, file, statusOf, jobCount, rule } = harness();
    const id = file("done");
    const created = await call.rules.create(rule(sample.container));
    expect(statusOf(id)).toBe("queued");

    await call.rules.set({
      id: created.id,
      enabled: false,
      ...sample.container,
    });
    expect(statusOf(id)).toBe("queued");
    expect(jobCount()).toBe(1);

    const other = file("done");
    await call.rules.remove({ id: created.id });
    expect(statusOf(other)).toBe("done");
  });

  test("disabled rule sends a pending file straight to done", async () => {
    const { call, file, statusOf, rule } = harness();
    const id = file("pending");

    await call.rules.create({
      ...rule(sample.container),
      enabled: false,
    });

    expect(statusOf(id)).toBe("done");
  });

  test("queued, processing, ignored and unprobed files are untouched", async () => {
    const { call, file, statusOf, jobCount, rule } = harness();
    const queued = file("queued");
    const processing = file("processing");
    const ignored = file("done", { ignored: true });
    const unprobed = file("pending", { mediaInfo: null });

    await call.rules.create(rule(sample.container));

    expect(statusOf(queued)).toBe("queued");
    expect(statusOf(processing)).toBe("processing");
    expect(statusOf(ignored)).toBe("done");
    expect(statusOf(unprobed)).toBe("pending");
    expect(jobCount()).toBe(0);
  });

  test("other libraries are not re-evaluated", async () => {
    const { call, db, rule } = harness();
    const other = seedLibrary(db, { name: "other" }).id;
    const id = seedFile(db, other, { status: "done", mediaInfo }).id;

    await call.rules.create(rule(sample.container));

    expect(db.select().from(files).where(eq(files.id, id)).get()?.status).toBe(
      "done",
    );
  });
});
