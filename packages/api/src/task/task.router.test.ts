import { describe, expect, test } from "bun:test";
import { basename } from "node:path";
import type { Task } from "@formatarr/contract";
import { createJobsForFiles } from "@/job/job.lib";
import { createTestCaller } from "@/testing/harness";
import {
  sampleMediaInfo,
  seedFile,
  seedJob,
  seedLibrary,
  seedRule,
} from "@/testing/seed";

async function setup() {
  const { call, context, db } = createTestCaller();
  const created = await call.workers.create({
    name: "w",
  });
  const request = new Request("http://localhost", {
    headers: { authorization: `Bearer ${created.token}` },
  });
  const asWorker = createTestCaller({ ...context, request }).call;
  const library = seedLibrary(db);
  const queue = () => {
    const file = seedFile(db, library.id, {
      status: "queued",
      mediaInfo: sampleMediaInfo,
    });
    return seedJob(db, file.id);
  };
  const connect = async () => {
    const abort = new AbortController();
    const stream = await asWorker.tasks.stream(undefined, {
      signal: abort.signal,
    });
    return { stream, abort };
  };
  const worker = () => call.workers.get({ id: created.id });
  return {
    call,
    context,
    db,
    asWorker,
    library,
    queue,
    connect,
    worker,
    id: created.id,
  };
}

async function received(result: Promise<{ value?: unknown }>) {
  return (await result).value as Task;
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("tasks.stream", () => {
  test("sends a queued job and marks the worker online", async () => {
    const { connect, queue, worker, id } = await setup();
    const job = queue();
    const { stream } = await connect();

    const task = await received(stream.next());

    expect(task.job).toMatchObject({ id: job.id, workerId: id });
    expect(await worker()).toMatchObject({
      status: "online",
      lastSeenAt: new Date(),
    });
    await stream.return?.();
  });

  test("waits for new jobs", async () => {
    const { context, db, library, connect, worker } = await setup();
    seedRule(db, library.id, { type: "container", value: "mp4" });
    const file = seedFile(db, library.id, {
      mediaInfo: sampleMediaInfo,
    });
    const { stream } = await connect();
    const next = stream.next();
    await flush();
    expect((await worker()).status).toBe("online");

    await createJobsForFiles(context, [file.id]);

    expect((await received(next)).fileName).toBe(basename(file.path));
    await stream.return?.();
  });

  test("sends the next job once the current one is finished", async () => {
    const { call, asWorker, connect, queue } = await setup();
    await call.settings.update({ jobs: { maxRetries: 0 } });
    const first = queue();
    const second = queue();
    const { stream } = await connect();
    await stream.next();
    const next = stream.next();
    await flush();

    await asWorker.jobs.update({
      id: first.id,
      progress: 100,
      status: "failed",
    });

    expect((await received(next)).job.id).toBe(second.id);
    await stream.return?.();
  });

  test("refuses a second stream for the same worker", async () => {
    const { connect, queue, worker } = await setup();
    queue();
    const first = await connect();
    await first.stream.next();
    const second = await connect();

    expect(second.stream.next()).rejects.toMatchObject({ code: "CONFLICT" });
    await flush();

    expect((await worker()).status).toBe("online");
    await first.stream.return?.();
  });

  test("closing the stream requeues the job and allows reconnecting", async () => {
    const { call, connect, queue, worker } = await setup();
    const job = queue();
    const first = await connect();
    await first.stream.next();

    await first.stream.return?.();

    expect((await worker()).status).toBe("offline");
    expect(await call.jobs.get({ id: job.id })).toMatchObject({
      status: "queued",
      workerId: null,
    });
    const second = await connect();
    expect((await received(second.stream.next())).job.id).toBe(job.id);
    await second.stream.return?.();
  });

  test("aborting the signal while waiting disconnects the worker", async () => {
    const { connect, worker } = await setup();
    const { stream, abort } = await connect();
    const next = stream.next();
    await flush();

    abort.abort();

    expect(next).rejects.toThrow();
    await flush();
    expect((await worker()).status).toBe("offline");
  });

  test("receives a job once its file is no longer ignored", async () => {
    const { call, db, library, connect } = await setup();
    const file = seedFile(db, library.id, {
      status: "queued",
      ignored: true,
      mediaInfo: sampleMediaInfo,
    });
    const job = seedJob(db, file.id);
    const { stream } = await connect();
    const next = stream.next();
    await flush();

    await call.files.update({ id: file.id, ignored: false });

    expect((await received(next)).job.id).toBe(job.id);
    await stream.return?.();
  });

  test("receives a job once its library is enabled again", async () => {
    const { call, library, queue, connect } = await setup();
    await call.libraries.update({ id: library.id, enabled: false });
    const job = queue();
    const { stream } = await connect();
    const next = stream.next();
    await flush();

    await call.libraries.update({ id: library.id, enabled: true });

    expect((await received(next)).job.id).toBe(job.id);
    await stream.return?.();
  });

  test("receives the next job once the current one is removed", async () => {
    const { call, connect, queue } = await setup();
    const first = queue();
    const second = queue();
    const { stream } = await connect();
    await stream.next();
    const next = stream.next();
    await flush();

    await call.jobs.remove({ id: first.id });

    expect((await received(next)).job.id).toBe(second.id);
    await stream.return?.();
  });

  test("receives the job of a worker that disconnects", async () => {
    const { call, context, connect, queue } = await setup();
    const job = queue();
    const first = await connect();
    await first.stream.next();
    const created = await call.workers.create({
      name: "other",
    });
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${created.token}` },
    });
    const second = await createTestCaller({
      ...context,
      request,
    }).call.tasks.stream();
    const next = second.next();
    await flush();

    await first.stream.return?.();

    expect((await received(next)).job).toMatchObject({
      id: job.id,
      workerId: created.id,
    });
    await second.return?.();
  });

  test.each([
    ["disabled", "disable"],
    ["removed", "remove"],
    ["given a new token", "regenerate"],
  ] as const)("ends when the worker is %s", async (_, action) => {
    const { call, context, connect, id } = await setup();
    const { stream } = await connect();
    const next = stream.next();
    await flush();

    if (action === "disable") {
      await call.workers.update({ id, enabled: false });
    } else if (action === "remove") {
      await call.workers.remove({ id });
    } else {
      await call.workers.regenerateToken({ id });
    }

    expect((await next).done).toBe(true);
    expect(context.workers.isConnected(id)).toBe(false);
  });
});
