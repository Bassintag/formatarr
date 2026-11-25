import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type {
  Condition,
  ConditionField,
  FileId,
  LibraryId,
  MediaInfo,
} from "@formatarr/contract";
import { eq } from "drizzle-orm";
import { files, jobs, libraries, rules } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import {
  createJobsForFiles,
  evaluateCondition,
  findMatchingRule,
  getFieldValues,
  matchRule,
} from "@/rules/rule.lib";
import { scanLibrary } from "@/scans/scans.lib";
import { createTestContext } from "@/testing/harness";
import { mockFileSystem } from "@/testing/memory-fs";

const mediaInfo: MediaInfo = {
  container: "matroska",
  durationSeconds: 100,
  bitrate: 5000,
  video: { codec: "h264", width: 1920, height: 1080 },
  audio: [
    { codec: "aac", language: "eng", channels: 2 },
    { codec: "ac3", language: null, channels: 6 },
  ],
  subtitles: [],
};

const file = { size: 1000, mediaInfo };
const silent = { size: 1000, mediaInfo: { ...mediaInfo, audio: [] } };

function cond(
  field: ConditionField,
  operator: Condition["operator"],
  value: Condition["value"],
) {
  return { field, operator, value } as Condition;
}

describe("getFieldValues", () => {
  test("maps every field", () => {
    expect(getFieldValues("container", file)).toEqual(["matroska"]);
    expect(getFieldValues("bitrate", file)).toEqual([5000]);
    expect(getFieldValues("videoCodec", file)).toEqual(["h264"]);
    expect(getFieldValues("width", file)).toEqual([1920]);
    expect(getFieldValues("height", file)).toEqual([1080]);
    expect(getFieldValues("audioCodec", file)).toEqual(["aac", "ac3"]);
    expect(getFieldValues("audioLanguages", file)).toEqual(["eng"]);
    expect(getFieldValues("size", file)).toEqual([1000]);
  });

  test("returns nothing without media info except size", () => {
    const bare = { size: 7, mediaInfo: null };
    expect(getFieldValues("container", bare)).toEqual([]);
    expect(getFieldValues("size", bare)).toEqual([7]);
  });
});

describe("evaluateCondition", () => {
  const scalarFields = [
    ["container", "matroska", "mp4"],
    ["videoCodec", "h264", "hevc"],
  ] as const;

  for (const [field, hit, miss] of scalarFields) {
    describe(field, () => {
      test("eq / neq", () => {
        expect(evaluateCondition(cond(field, "eq", hit), file)).toBe(true);
        expect(evaluateCondition(cond(field, "eq", miss), file)).toBe(false);
        expect(evaluateCondition(cond(field, "neq", miss), file)).toBe(true);
        expect(evaluateCondition(cond(field, "neq", hit), file)).toBe(false);
      });
      test("in / notIn", () => {
        expect(evaluateCondition(cond(field, "in", [miss, hit]), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "in", [miss]), file)).toBe(false);
        expect(evaluateCondition(cond(field, "notIn", [miss]), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "notIn", [hit]), file)).toBe(
          false,
        );
      });
      test("gt / lt never match text", () => {
        expect(evaluateCondition(cond(field, "gt", 1), file)).toBe(false);
        expect(evaluateCondition(cond(field, "lt", 1), file)).toBe(false);
      });
    });
  }

  const numericFields = [
    ["width", 1920],
    ["height", 1080],
    ["bitrate", 5000],
    ["size", 1000],
  ] as const;

  for (const [field, actual] of numericFields) {
    describe(field, () => {
      test("eq / neq", () => {
        expect(evaluateCondition(cond(field, "eq", actual), file)).toBe(true);
        expect(evaluateCondition(cond(field, "eq", actual + 1), file)).toBe(
          false,
        );
        expect(evaluateCondition(cond(field, "neq", actual + 1), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "neq", actual), file)).toBe(false);
      });
      test("gt / lt", () => {
        expect(evaluateCondition(cond(field, "gt", actual - 1), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "gt", actual), file)).toBe(false);
        expect(evaluateCondition(cond(field, "lt", actual + 1), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "lt", actual), file)).toBe(false);
      });
      test("in / notIn", () => {
        expect(evaluateCondition(cond(field, "in", [actual, 1]), file)).toBe(
          true,
        );
        expect(evaluateCondition(cond(field, "in", [1]), file)).toBe(false);
        expect(evaluateCondition(cond(field, "notIn", [1]), file)).toBe(true);
        expect(evaluateCondition(cond(field, "notIn", [actual]), file)).toBe(
          false,
        );
      });
    });
  }

  describe("audioCodec", () => {
    test("eq / in match any track", () => {
      expect(evaluateCondition(cond("audioCodec", "eq", "ac3"), file)).toBe(
        true,
      );
      expect(evaluateCondition(cond("audioCodec", "eq", "dts"), file)).toBe(
        false,
      );
      expect(
        evaluateCondition(cond("audioCodec", "in", ["dts", "aac"]), file),
      ).toBe(true);
      expect(evaluateCondition(cond("audioCodec", "in", ["dts"]), file)).toBe(
        false,
      );
    });
    test("neq / notIn require no track to match", () => {
      expect(evaluateCondition(cond("audioCodec", "neq", "aac"), file)).toBe(
        false,
      );
      expect(evaluateCondition(cond("audioCodec", "neq", "dts"), file)).toBe(
        true,
      );
      expect(
        evaluateCondition(cond("audioCodec", "notIn", ["dts", "ac3"]), file),
      ).toBe(false);
      expect(
        evaluateCondition(cond("audioCodec", "notIn", ["dts"]), file),
      ).toBe(true);
    });
    test("gt / lt never match", () => {
      expect(evaluateCondition(cond("audioCodec", "gt", 1), file)).toBe(false);
      expect(evaluateCondition(cond("audioCodec", "lt", 1), file)).toBe(false);
    });
    test("no audio track", () => {
      expect(evaluateCondition(cond("audioCodec", "eq", "aac"), silent)).toBe(
        false,
      );
      expect(evaluateCondition(cond("audioCodec", "neq", "aac"), silent)).toBe(
        true,
      );
    });
  });

  describe("audioLanguages", () => {
    test("eq / in", () => {
      expect(evaluateCondition(cond("audioLanguages", "eq", "eng"), file)).toBe(
        true,
      );
      expect(evaluateCondition(cond("audioLanguages", "eq", "fra"), file)).toBe(
        false,
      );
      expect(
        evaluateCondition(cond("audioLanguages", "in", ["fra", "eng"]), file),
      ).toBe(true);
      expect(
        evaluateCondition(cond("audioLanguages", "in", ["fra"]), file),
      ).toBe(false);
    });
    test("neq / notIn", () => {
      expect(
        evaluateCondition(cond("audioLanguages", "neq", "eng"), file),
      ).toBe(false);
      expect(
        evaluateCondition(cond("audioLanguages", "neq", "fra"), file),
      ).toBe(true);
      expect(
        evaluateCondition(cond("audioLanguages", "notIn", ["eng"]), file),
      ).toBe(false);
      expect(
        evaluateCondition(cond("audioLanguages", "notIn", ["fra"]), file),
      ).toBe(true);
    });
    test("gt / lt never match", () => {
      expect(evaluateCondition(cond("audioLanguages", "gt", 1), file)).toBe(
        false,
      );
      expect(evaluateCondition(cond("audioLanguages", "lt", 1), file)).toBe(
        false,
      );
    });
    test("untagged tracks are ignored", () => {
      const untagged = {
        size: 1,
        mediaInfo: {
          ...mediaInfo,
          audio: [{ codec: "aac", language: null, channels: 2 }],
        },
      };
      expect(
        evaluateCondition(cond("audioLanguages", "eq", "eng"), untagged),
      ).toBe(false);
      expect(
        evaluateCondition(cond("audioLanguages", "neq", "eng"), untagged),
      ).toBe(true);
    });
  });

  test("media info fields do not match without media info", () => {
    const bare = { size: 1, mediaInfo: null };
    expect(evaluateCondition(cond("width", "gt", 0), bare)).toBe(false);
    expect(evaluateCondition(cond("size", "gt", 0), bare)).toBe(true);
  });
});

describe("matchRule", () => {
  test("requires every condition", () => {
    const both = [cond("videoCodec", "eq", "h264"), cond("width", "gt", 1280)];
    const mixed = [cond("videoCodec", "eq", "h264"), cond("width", "gt", 4000)];
    expect(matchRule({ conditions: both }, file)).toBe(true);
    expect(matchRule({ conditions: mixed }, file)).toBe(false);
  });

  test("a rule without conditions matches", () => {
    expect(matchRule({ conditions: [] }, file)).toBe(true);
  });
});

describe("findMatchingRule", () => {
  const match = [cond("videoCodec", "eq", "h264")];
  const miss = [cond("videoCodec", "eq", "hevc")];

  test("returns the first enabled match", () => {
    const list = [
      { id: 1, enabled: true, conditions: miss },
      { id: 2, enabled: true, conditions: match },
      { id: 3, enabled: true, conditions: match },
    ];
    expect(findMatchingRule(list, file)?.id).toBe(2);
  });

  test("skips disabled rules", () => {
    const list = [
      { id: 1, enabled: false, conditions: match },
      { id: 2, enabled: true, conditions: match },
    ];
    expect(findMatchingRule(list, file)?.id).toBe(2);
  });

  test("returns undefined when nothing matches", () => {
    expect(
      findMatchingRule([{ id: 1, enabled: true, conditions: miss }], file),
    ).toBeUndefined();
  });
});

const actions = [{ type: "setContainer", container: "mp4" }] as never;

async function setupJobs() {
  const context = createTestContext();
  const library = await firstOrThrow(
    context.db
      .insert(libraries)
      .values({ name: "lib", path: "/tmp/lib" })
      .returning({ id: libraries.id }),
  );
  const addRule = (
    conditions: Condition[],
    options: { enabled?: boolean; libraryId?: LibraryId } = {},
  ) =>
    firstOrThrow(
      context.db
        .insert(rules)
        .values({
          libraryId: options.libraryId ?? library.id,
          name: "rule",
          enabled: options.enabled ?? true,
          conditions,
          actions,
        })
        .returning({ id: rules.id }),
    );
  const addFile = (
    name: string,
    values: Partial<typeof files.$inferInsert> = {},
  ) =>
    firstOrThrow(
      context.db
        .insert(files)
        .values({
          libraryId: library.id,
          path: `/tmp/lib/${name}`,
          size: 1000,
          mediaInfo,
          ...values,
        })
        .returning({ id: files.id }),
    );
  const allJobs = () => context.db.select().from(jobs).all();
  const fileStatus = (id: FileId) =>
    context.db.select().from(files).where(eq(files.id, id)).get()?.status;
  return { context, library, addRule, addFile, allJobs, fileStatus };
}

describe("createJobsForFiles", () => {
  test("creates a queued job and queues the file", async () => {
    const { context, addRule, addFile, allJobs, fileStatus } =
      await setupJobs();
    const rule = await addRule([cond("videoCodec", "eq", "h264")]);
    const f = await addFile("a.mkv");
    const received: unknown[] = [];
    const publish = context.events.publish.bind(context.events);
    context.events.publish = (async (name: "event", payload: unknown) => {
      received.push(payload);
      return publish(name, payload as never);
    }) as typeof context.events.publish;

    const count = await createJobsForFiles(context, [f.id]);
    expect(count).toBe(1);
    const [job] = allJobs();
    expect(job).toMatchObject({
      fileId: f.id,
      ruleId: rule.id,
      status: "queued",
    });
    expect(fileStatus(f.id)).toBe("queued");

    expect(received).toContainEqual({
      resource: "job",
      change: "created",
      id: job?.id,
    });
    expect(received).toContainEqual({
      resource: "file",
      change: "updated",
      id: f.id,
    });
  });

  test("skips ignored, done, failed and unprobed files", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    await addRule([]);
    const ids = [
      (await addFile("ignored.mkv", { ignored: true })).id,
      (await addFile("done.mkv", { status: "done" })).id,
      (await addFile("failed.mkv", { status: "failed" })).id,
      (await addFile("raw.mkv", { mediaInfo: null })).id,
    ];
    expect(await createJobsForFiles(context, ids)).toBe(0);
    expect(allJobs()).toHaveLength(0);
  });

  test("the lowest id matching rule wins and disabled rules are skipped", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    await addRule([cond("videoCodec", "eq", "hevc")]);
    await addRule([cond("videoCodec", "eq", "h264")], { enabled: false });
    const winner = await addRule([cond("width", "gt", 1000)]);
    await addRule([]);
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    expect(allJobs().map((j) => j.ruleId)).toEqual([winner.id]);
  });

  test("does not create duplicates on a second run", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    await addRule([]);
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    expect(await createJobsForFiles(context, [f.id])).toBe(0);
    expect(allJobs()).toHaveLength(1);
  });

  test("ignores rules from other libraries", async () => {
    const { context, addRule, addFile, allJobs } = await setupJobs();
    const other = await firstOrThrow(
      context.db
        .insert(libraries)
        .values({ name: "other", path: "/tmp/other" })
        .returning({ id: libraries.id }),
    );
    await addRule([], { libraryId: other.id });
    const f = await addFile("a.mkv");
    expect(await createJobsForFiles(context, [f.id])).toBe(0);
    expect(allJobs()).toHaveLength(0);
  });

  test("leaves files without a matching rule pending", async () => {
    const { context, addRule, addFile, fileStatus } = await setupJobs();
    await addRule([cond("videoCodec", "eq", "hevc")]);
    const f = await addFile("a.mkv");
    await createJobsForFiles(context, [f.id]);
    expect(fileStatus(f.id)).toBe("pending");
  });
});

describe("scanLibrary integration", () => {
  test("creates jobs for probed files", async () => {
    const context = createTestContext();
    const root = "/media";
    mockFileSystem({ [join(root, "movie.mkv")]: "12345" });
    const library = await firstOrThrow(
      context.db
        .insert(libraries)
        .values({ name: "lib", path: root })
        .returning({ id: libraries.id }),
    );
    await context.db.insert(rules).values({
      libraryId: library.id,
      name: "h264",
      conditions: [cond("videoCodec", "eq", "h264")],
      actions,
    });
    await scanLibrary(context, library.id);
    const created = context.db.select().from(jobs).all();
    expect(created).toHaveLength(1);
    expect(context.db.select().from(files).get()?.status).toBe("queued");
  });
});
