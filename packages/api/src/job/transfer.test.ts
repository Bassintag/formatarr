import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  spyOn,
  test,
} from "bun:test";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ApiClient, contract, type JobId } from "@formatarr/contract";
import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi/fetch";
import { createFetchHandler } from "@/app";
import { files, jobs } from "@/db/schema";
import { scanLibrary } from "@/scan/scan.lib";
import { interruptJobs } from "@/task/task.lib";
import { createTestCaller } from "@/testing/harness";
import {
  sampleMediaInfo,
  seedFile,
  seedIntegration,
  seedJob,
  seedLibrary,
  seedWorker,
} from "@/testing/seed";
import { hashWorkerToken } from "@/worker/worker.lib";

const source = new Uint8Array(randomBytes(256 * 1024));
const output = new Uint8Array(randomBytes(128 * 1024));

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "formatarr-api-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

type SetupOptions = {
  name?: string;
  container?: string;
  probe?: () => Promise<unknown>;
};

function probed(formatName: string, codecType = "video") {
  return async () => ({
    format: { format_name: formatName, duration: "100", bit_rate: "1000" },
    streams: [{ codec_type: codecType, codec_name: "hevc" }],
  });
}

async function setup({
  name = "movie.mkv",
  container = "mkv",
  probe = probed("matroska,webm"),
}: SetupOptions = {}) {
  const { call, context, db } = createTestCaller({ probe });
  const library = seedLibrary(db, { path: root });
  const asWorker = (token: string) => {
    const worker = seedWorker(db, { tokenHash: hashWorkerToken(token) });
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${token}` },
    });
    return { worker, call: createTestCaller({ ...context, request }).call };
  };
  const owner = asWorker("owner");
  const path = join(root, name);
  await Bun.write(path, source);
  const file = seedFile(db, library.id, {
    path,
    size: source.length,
    status: "processing",
    mediaInfo: { ...sampleMediaInfo, container },
  });
  const job = seedJob(db, file.id, [], {
    workerId: owner.worker.id,
    status: "running",
    startedAt: new Date(),
  });
  return { call, context, db, library, file, job, path, owner, asWorker };
}

async function partials() {
  return (await readdir(root)).filter((name) => name.endsWith(".part"));
}

async function expectUntouched(state: Awaited<ReturnType<typeof setup>>) {
  const { call, job, file, path } = state;
  expect(await Bun.file(path).bytes()).toEqual(source);
  expect(await partials()).toEqual([]);
  expect((await call.jobs.get({ id: job.id })).status).toBe("running");
  expect(await call.files.get({ id: file.id })).toMatchObject({
    path,
    size: source.length,
    status: "processing",
  });
}

function during(action: () => unknown) {
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        await action();
        controller.enqueue(output);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
}

function failing(code: string) {
  return () => {
    throw Object.assign(new Error(code), { code });
  };
}

async function bytes(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function upload(id: JobId, content = output, size = content.length) {
  return {
    params: { id },
    query: { size },
    body: new Blob([content]).stream(),
  };
}

describe("jobs.source", () => {
  test("streams the source file", async () => {
    const { owner, job } = await setup();

    const stream = await owner.call.jobs.source({ id: job.id });

    expect(await bytes(stream)).toEqual(source);
  });

  test("is not found once the file is gone", async () => {
    const { owner, job, path } = await setup();
    await rm(path);

    expect(owner.call.jobs.source({ id: job.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("is hidden from other workers", async () => {
    const { asWorker, job } = await setup();

    expect(
      asWorker("other").call.jobs.source({ id: job.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("jobs.result", () => {
  test("replaces the source and completes the job", async () => {
    const { call, owner, job, file, path } = await setup();
    await chmod(path, 0o640);

    const updated = await owner.call.jobs.result(upload(job.id));

    expect(updated).toMatchObject({
      status: "succeeded",
      progress: 100,
      finishedAt: new Date(),
    });
    expect(await call.files.get({ id: file.id })).toMatchObject({
      path,
      size: output.length,
      status: "done",
      mediaInfo: { video: { codec: "hevc" } },
    });
    expect(await Bun.file(path).bytes()).toEqual(output);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    expect(await readdir(root)).toEqual(["movie.mkv"]);
  });

  test("succeeds even when the rescan fails", async () => {
    const { call, db, library, owner, job } = await setup();
    seedIntegration(db, [library.id]);
    const failed = Promise.withResolvers<void>();
    spyOn(globalThis, "fetch").mockImplementation((async () => {
      failed.resolve();
      throw new Error("unreachable");
    }) as unknown as typeof fetch);

    const updated = await owner.call.jobs.result(upload(job.id));
    await failed.promise;
    await new Promise(setImmediate);

    expect(updated.status).toBe("succeeded");
    const logs = await call.jobs.logs({ id: job.id });
    expect(JSON.stringify(logs)).toContain("Rescan failed on arr: unreachable");
  });

  test("renames the file when the container changes", async () => {
    const { call, owner, job, file } = await setup({
      name: "movie.avi",
      container: "avi",
    });

    await owner.call.jobs.result(upload(job.id));

    const target = join(root, "movie.mkv");
    expect(await readdir(root)).toEqual(["movie.mkv"]);
    expect(await Bun.file(target).bytes()).toEqual(output);
    expect(await call.files.get({ id: file.id })).toMatchObject({
      path: target,
      mediaInfo: { container: "mkv" },
    });
  });

  test("renames the file when hard links are not supported", async () => {
    const { owner, job } = await setup({
      name: "movie.avi",
      container: "avi",
    });
    spyOn(fs, "linkSync").mockImplementation(failing("EPERM"));

    await owner.call.jobs.result(upload(job.id));

    expect(await readdir(root)).toEqual(["movie.mkv"]);
  });

  test.each([
    ["with hard links", false],
    ["without hard links", true],
  ])("never overwrites another file %s", async (_, unsupported) => {
    const state = await setup({ name: "movie.avi", container: "avi" });
    const target = join(root, "movie.mkv");
    await Bun.write(target, "other");
    if (unsupported) {
      spyOn(fs, "linkSync").mockImplementation(failing("EPERM"));
    }

    await expect(
      state.owner.call.jobs.result(upload(state.job.id)),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await Bun.file(target).text()).toBe("other");
    await expectUntouched(state);
  });

  test("rejects a target already known to the library", async () => {
    const state = await setup({ name: "movie.avi", container: "avi" });
    const target = join(root, "movie.mkv");
    seedFile(state.db, state.library.id, { path: target });

    await expect(
      state.owner.call.jobs.result(upload(state.job.id)),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await Bun.file(target).exists()).toBe(false);
    await expectUntouched(state);
  });

  test.each([
    [
      "ffprobe cannot read",
      async () => {
        throw new Error("invalid data");
      },
    ],
    ["without a video stream", probed("matroska,webm", "audio")],
    ["in an unsupported container", probed("avi")],
  ])("rejects a result %s", async (_, probe) => {
    const state = await setup({ probe });

    await expect(
      state.owner.call.jobs.result(upload(state.job.id)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expectUntouched(state);
  });

  test("rejects a source that changed during the upload", async () => {
    const { call, owner, job, path } = await setup();
    const body = during(() => Bun.write(path, "changed"));

    await expect(
      owner.call.jobs.result({ ...upload(job.id), body }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await Bun.file(path).text()).toBe("changed");
    expect(await partials()).toEqual([]);
    expect((await call.jobs.get({ id: job.id })).status).toBe("running");
  });

  test("rejects a source removed during the upload", async () => {
    const { owner, job, path } = await setup();
    const body = during(() => rm(path));

    await expect(
      owner.call.jobs.result({ ...upload(job.id), body }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await readdir(root)).toEqual([]);
  });

  test("rejects an upload from a previous attempt", async () => {
    const state = await setup();
    const { db, owner, job } = state;
    const body = during(() => {
      db.transaction((tx) =>
        interruptJobs(tx, { reason: "lost", maxRetries: 2 }),
      );
      db.update(jobs)
        .set({
          status: "running",
          workerId: owner.worker.id,
          startedAt: new Date(Date.now() + 1000),
        })
        .run();
      db.update(files).set({ status: "processing" }).run();
    });

    await expect(
      owner.call.jobs.result({ ...upload(job.id), body }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expectUntouched(state);
  });

  test("keeps everything when the replacement fails", async () => {
    const state = await setup();
    spyOn(fs, "renameSync").mockImplementation(failing("EIO"));

    await expect(
      state.owner.call.jobs.result(upload(state.job.id)),
    ).rejects.toThrow();

    await expectUntouched(state);
  });

  test.each([
    ["at the same path", "movie.mkv", "mkv"],
    ["under a new name", "movie.avi", "avi"],
  ])("is not seen as new by a scan %s", async (_, name, container) => {
    const { context, db, library, owner, job } = await setup({
      name,
      container,
    });
    await owner.call.jobs.result(upload(job.id));

    expect(await scanLibrary(context, library.id)).toEqual({
      created: 0,
      updated: 0,
      deleted: 0,
    });
    expect(db.select().from(jobs).all()).toHaveLength(1);
  });

  test("dispatches the next job", async () => {
    const { context, db, library, owner, job } = await setup();
    const file = seedFile(db, library.id, {
      status: "queued",
      mediaInfo: sampleMediaInfo,
    });
    const next = seedJob(db, file.id);
    const messages = context.workers.connect(owner.worker.id);

    await owner.call.jobs.result(upload(job.id));

    expect((await messages?.next())?.value).toMatchObject({
      task: { job: { id: next.id } },
    });
  });

  test("rejects an upload of the wrong size", async () => {
    const { call, owner, job } = await setup();

    await expect(
      owner.call.jobs.result(upload(job.id, output, output.length + 1)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(await partials()).toEqual([]);
    expect((await call.jobs.get({ id: job.id })).status).toBe("running");
  });

  test("rejects another worker", async () => {
    const { asWorker, job } = await setup();

    await expect(
      asWorker("other").call.jobs.result(upload(job.id)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await partials()).toEqual([]);
  });

  test("rejects a job that is not running", async () => {
    const { owner, job } = await setup();
    await owner.call.jobs.update({
      id: job.id,
      progress: 0,
      status: "failed",
    });

    await expect(owner.call.jobs.result(upload(job.id))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(await partials()).toEqual([]);
  });

  test("discards the result of a job removed during the upload", async () => {
    const { call, owner, job } = await setup();
    const body = during(() => call.jobs.remove({ id: job.id }));

    await expect(
      owner.call.jobs.result({ ...upload(job.id), body }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await partials()).toEqual([]);
  });
});

describe("transfers over HTTP", () => {
  const maxBodySize = 1024;
  let server: ReturnType<typeof Bun.serve> | undefined;

  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    server?.stop(true);
  });

  async function serve() {
    const state = await setup();
    const running = Bun.serve({
      port: 0,
      maxRequestBodySize: Number.MAX_SAFE_INTEGER,
      fetch: createFetchHandler(state.context, { maxBodySize }),
    });
    server = running;
    const client: ApiClient = createORPCClient(
      new OpenAPILink(contract, {
        origin: running.url.origin,
        url: "/",
        headers: () => ({ authorization: "Bearer owner" }),
      }),
    );
    return { ...state, client, server: running };
  }

  async function until(condition: () => Promise<boolean>) {
    while (!(await condition())) await Bun.sleep(10);
  }

  test("downloads the source and uploads a result above the body limit", async () => {
    const { client, job, path } = await serve();

    const downloaded = await client.jobs.source({ id: job.id });
    expect(await bytes(downloaded)).toEqual(source);
    const updated = await client.jobs.result(upload(job.id));

    expect(updated.status).toBe("succeeded");
    expect(await Bun.file(path).bytes()).toEqual(output);
  });

  test("keeps the body limit on other routes", async () => {
    const { server } = await serve();

    const response = await fetch(new URL("/auth/login", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "a".repeat(maxBodySize) }),
    });

    expect(response.status).toBe(413);
  });

  test.each([
    ["chunked", "Transfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n"],
    ["sized", "Content-Length: 100\r\n\r\nhello"],
  ])("discards an interrupted %s upload", async (_, rest) => {
    const { call, server, job } = await serve();
    const socket = connect(server.port as number, "localhost");
    socket.write(
      `PUT /jobs/${job.id}/result?size=5 HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer owner\r\nContent-Type: application/octet-stream\r\n${rest}`,
    );
    await until(async () => (await partials()).length === 1);

    socket.destroy();
    await until(async () => (await partials()).length === 0);

    expect((await call.jobs.get({ id: job.id })).status).toBe("running");
  });
});
