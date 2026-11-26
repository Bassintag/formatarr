import { describe, expect, spyOn, test } from "bun:test";
import { rescanIntegrations } from "@/integration/arr.lib";
import { listJobLogs } from "@/log/log.lib";
import { createTestContext } from "@/testing/harness";
import {
  seedFile,
  seedIntegration,
  seedJob,
  seedLibrary,
} from "@/testing/seed";

const path = "/media/Aliens/Aliens.mkv";

function setup() {
  const context = createTestContext();
  const { db } = context;
  const library = seedLibrary(db, { path: "/media" });
  const file = seedFile(db, library.id, { path });
  const job = seedJob(db, file.id);
  const logs = () => listJobLogs(db, job.id).map((log) => log.message);
  return { context, db, library, file, job, logs };
}

function fakeArr(media: { id: number; path: string }[]) {
  const requests: { method?: string; url: string; body?: unknown }[] = [];
  spyOn(globalThis, "fetch").mockImplementation((async (
    url: string,
    init: RequestInit,
  ) => {
    if (url.startsWith("http://down.test")) throw new Error("unreachable");
    requests.push({
      method: init.method,
      url,
      body: init.body && JSON.parse(init.body as string),
    });
    return Response.json(init.method === "GET" ? media : {});
  }) as typeof fetch);
  return requests;
}

describe("rescanIntegrations", () => {
  test.each([
    ["radarr", "movie", { name: "RescanMovie", movieId: 2 }],
    ["sonarr", "series", { name: "RescanSeries", seriesId: 2 }],
  ] as const)("rescans the %s item containing the file", async (...args) => {
    const [type, resource, command] = args;
    const { context, db, library, file, job, logs } = setup();
    seedIntegration(db, [library.id], {
      type,
      baseUrl: "http://arr.test/base/",
    });
    const requests = fakeArr([
      { id: 1, path: "/media/Alien" },
      { id: 2, path: "/media/Aliens/" },
    ]);

    await rescanIntegrations(context, job.id, file);

    expect(requests).toEqual([
      {
        method: "GET",
        url: `http://arr.test/base/api/v3/${resource}`,
        body: undefined,
      },
      {
        method: "POST",
        url: "http://arr.test/base/api/v3/command",
        body: command,
      },
    ]);
    expect(logs()).toEqual([]);
  });

  test("logs when no item matches the file path", async () => {
    const { context, db, library, file, job, logs } = setup();
    seedIntegration(db, [library.id]);
    const requests = fakeArr([{ id: 1, path: "/media/Alien" }]);

    await rescanIntegrations(context, job.id, file);

    expect(requests).toHaveLength(1);
    expect(logs()).toEqual([`Rescan failed on arr: No movie matches ${path}`]);
  });

  test("ignores disabled and unlinked integrations", async () => {
    const { context, db, library, file, job } = setup();
    seedIntegration(db, [library.id], { enabled: false });
    seedIntegration(db, [seedLibrary(db, { path: "/other" }).id]);
    seedIntegration(db);
    const requests = fakeArr([]);

    await rescanIntegrations(context, job.id, file);

    expect(requests).toEqual([]);
  });

  test("keeps going when an integration fails", async () => {
    const { context, db, library, file, job, logs } = setup();
    seedIntegration(db, [library.id], {
      name: "down",
      baseUrl: "http://down.test",
    });
    seedIntegration(db, [library.id]);
    const requests = fakeArr([{ id: 2, path: "/media/Aliens" }]);

    await rescanIntegrations(context, job.id, file);

    expect(requests).toHaveLength(2);
    expect(logs()).toEqual(["Rescan failed on down: unreachable"]);
  });
});
