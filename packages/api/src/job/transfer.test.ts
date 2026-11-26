import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ApiClient, contract, type JobId } from "@formatarr/contract";
import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi/fetch";
import { createFetchHandler } from "@/app";
import { createTestCaller } from "@/testing/harness";
import {
  sampleMediaInfo,
  seedFile,
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

async function setup() {
  const { call, context, db } = createTestCaller();
  const library = seedLibrary(db, { path: root });
  const asWorker = (token: string) => {
    const worker = seedWorker(db, { tokenHash: hashWorkerToken(token) });
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${token}` },
    });
    return { worker, call: createTestCaller({ ...context, request }).call };
  };
  const owner = asWorker("owner");
  const path = join(root, "movie.mkv");
  await Bun.write(path, source);
  const file = seedFile(db, library.id, {
    path,
    size: source.length,
    status: "processing",
    mediaInfo: sampleMediaInfo,
  });
  const job = seedJob(db, file.id, [], {
    workerId: owner.worker.id,
    status: "running",
  });
  return { call, context, db, library, file, job, path, owner, asWorker };
}

async function partials() {
  return (await readdir(root)).filter((name) => name.endsWith(".part"));
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
  test("stores the result next to the source and completes the job", async () => {
    const { call, owner, job, file, path } = await setup();

    const updated = await owner.call.jobs.result(upload(job.id));

    expect(updated).toMatchObject({
      status: "succeeded",
      progress: 100,
      finishedAt: new Date(),
    });
    expect(await call.files.get({ id: file.id })).toMatchObject({
      status: "done",
    });
    const [partial, ...others] = await partials();
    expect(others).toEqual([]);
    expect(partial).toStartWith(`.formatarr-${job.id}-`);
    expect(await Bun.file(join(root, partial as string)).bytes()).toEqual(
      output,
    );
    expect(await Bun.file(path).bytes()).toEqual(source);
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
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await call.jobs.remove({ id: job.id });
        controller.enqueue(output);
        controller.close();
      },
    });

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
    const { client, job } = await serve();

    const downloaded = await client.jobs.source({ id: job.id });
    expect(await bytes(downloaded)).toEqual(source);
    const updated = await client.jobs.result(upload(job.id));

    expect(updated.status).toBe("succeeded");
    const [partial] = await partials();
    expect(await Bun.file(join(root, partial as string)).bytes()).toEqual(
      output,
    );
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
