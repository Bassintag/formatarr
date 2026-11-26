import { describe, expect, test } from "bun:test";
import { createTestCaller } from "@/testing/harness";
import {
  sampleMediaInfo,
  seedFile,
  seedJob,
  seedLibrary,
} from "@/testing/seed";

async function subscribed(stream: AsyncIterator<unknown>) {
  const first = stream.next();
  await Promise.resolve();
  return { first };
}

describe("events.stream", () => {
  test("emits worker presence and job activity", async () => {
    const { call, context, db } = createTestCaller();
    const worker = await call.workers.create({
      name: "w",
    });
    const request = new Request("http://localhost", {
      headers: { authorization: `Bearer ${worker.token}` },
    });
    const asWorker = createTestCaller({ ...context, request }).call;
    await call.settings.update({ jobs: { maxRetries: 0 } });
    const library = seedLibrary(db);
    const file = seedFile(db, library.id, {
      status: "queued",
      mediaInfo: sampleMediaInfo,
    });
    const job = seedJob(db, file.id);
    const stream = await call.events.stream();
    const { first } = await subscribed(stream);
    const events: unknown[] = [];
    const receive = async (count: number) => {
      for (let i = 0; i < count; i++) {
        events.push((await stream.next()).value);
      }
    };

    const tasks = await asWorker.tasks.stream();
    await tasks.next();
    events.push((await first).value);
    await receive(1);
    await asWorker.jobs.update({ id: job.id, progress: 40 });
    await asWorker.jobs.update({
      id: job.id,
      progress: 100,
      status: "failed",
    });
    await receive(2);
    await tasks.return?.();
    await receive(1);
    await stream.return?.();

    expect(events).toEqual([
      { type: "worker.connected", id: worker.id },
      { type: "job.status", id: job.id, status: "running" },
      { type: "job.progress", id: job.id, progress: 40 },
      { type: "job.status", id: job.id, status: "failed" },
      { type: "worker.disconnected", id: worker.id },
    ]);
  });

  test("rejects anonymous callers", () => {
    const { call } = createTestCaller({}, { authenticated: false });
    expect(call.events.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
