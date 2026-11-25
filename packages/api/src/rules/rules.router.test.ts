import { describe, expect, test } from "bun:test";
import type { LibraryId, RuleType, RuleValue } from "@formatarr/contract";
import { createTestCaller } from "@/testing/harness";
import { seedLibrary, unknownId } from "@/testing/seed";

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
