import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { integrations, libraryIntegrations } from "@/db/schema";
import { createTestCaller } from "@/testing/harness";
import { seedIntegration, seedLibrary, unknownId } from "@/testing/seed";

const API_KEY = "super-secret-api-key-1234";

const input = {
  type: "radarr",
  name: "radarr",
  baseUrl: "http://radarr:7878",
  apiKey: API_KEY,
  enabled: true,
} as const;

describe("integrations CRUD", () => {
  test("create returns a masked api key and get equals created", async () => {
    const { call } = createTestCaller();

    const created = await call.integrations.create(input);

    expect(created.apiKey).toBe("••••1234");
    expect(JSON.stringify(created)).not.toContain(API_KEY);
    expect(await call.integrations.get({ id: created.id })).toEqual(created);
  });

  test("api key is stored unmasked", async () => {
    const { call, db } = createTestCaller();

    const { id } = await call.integrations.create(input);

    const row = db.query.integrations.findFirst({ where: { id } }).sync();
    expect(row?.apiKey).toBe(API_KEY);
  });

  test("short api keys are fully masked", async () => {
    const { call } = createTestCaller();

    const created = await call.integrations.create({ ...input, apiKey: "abc" });

    expect(created.apiKey).toBe("••••");
  });

  test("create rejects invalid input", async () => {
    const { call } = createTestCaller();

    expect(
      call.integrations.create({ ...input, baseUrl: "nope" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.integrations.create({ ...input, name: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      call.integrations.create({ ...input, apiKey: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("list paginates and never exposes the api key", async () => {
    const { call } = createTestCaller();
    for (const name of ["a", "b", "c"]) {
      await call.integrations.create({ ...input, name });
    }

    const page = await call.integrations.list({ page: 1, pageSize: 2 });

    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.name)).toEqual(["c"]);
    expect(JSON.stringify(page)).not.toContain(API_KEY);
  });

  test("update keeps the api key unless provided", async () => {
    const { call, db } = createTestCaller();
    const { id } = await call.integrations.create(input);

    const renamed = await call.integrations.update({ id, name: "films" });
    expect(renamed.name).toBe("films");
    expect(renamed.baseUrl).toBe(input.baseUrl);
    expect(renamed.apiKey).toBe("••••1234");
    const unchanged = db.query.integrations.findFirst({ where: { id } }).sync();
    expect(unchanged?.apiKey).toBe(API_KEY);

    const rekeyed = await call.integrations.update({
      id,
      apiKey: "another-key-5678",
    });
    expect(rekeyed.apiKey).toBe("••••5678");
    const replaced = db.query.integrations.findFirst({ where: { id } }).sync();
    expect(replaced?.apiKey).toBe("another-key-5678");
  });

  test("remove deletes the integration and its library links", async () => {
    const { call, db } = createTestCaller();
    const { id } = await call.integrations.create(input);
    const library = seedLibrary(db);
    db.insert(libraryIntegrations)
      .values({ libraryId: library.id, integrationId: id })
      .run();

    await call.integrations.remove({ id });

    expect(call.integrations.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.select().from(libraryIntegrations).all()).toEqual([]);
    expect(
      db.select().from(integrations).where(eq(integrations.id, id)).all(),
    ).toEqual([]);
  });

  test("unknown ids are not found", async () => {
    const { call } = createTestCaller();
    const id = unknownId;

    expect(call.integrations.get({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.integrations.update({ id, name: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.integrations.update({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(call.integrations.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("integrations.test", () => {
  test("returns the version using the stored api key", async () => {
    const { call, db } = createTestCaller();
    const { id } = seedIntegration(db, [], {
      apiKey: API_KEY,
      enabled: false,
    });
    const fetched = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ appName: "Radarr", version: "5.1.0" }),
    );

    expect(await call.integrations.test({ id })).toEqual({ version: "5.1.0" });

    expect(fetched).toHaveBeenCalledWith(
      "http://arr.test/api/v3/system/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "x-api-key": API_KEY }),
      }),
    );
  });

  test.each([
    [
      "is unreachable",
      async () => {
        throw new Error("unreachable");
      },
    ],
    ["rejects the api key", async () => new Response(null, { status: 401 })],
    ["is not an arr app", async () => new Response("<html></html>")],
  ])("fails when the server %s", async (_, respond) => {
    const { call, db } = createTestCaller();
    const { id } = seedIntegration(db);
    spyOn(globalThis, "fetch").mockImplementation(respond as never);

    await expect(call.integrations.test({ id })).rejects.toMatchObject({
      code: "BAD_GATEWAY",
    });
  });

  test("unknown ids are not found", async () => {
    const { call } = createTestCaller();

    await expect(
      call.integrations.test({ id: unknownId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
