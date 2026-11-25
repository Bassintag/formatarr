import { describe, expect, test } from "bun:test";
import { files, libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";

async function subscribed(stream: AsyncIterator<unknown>) {
  const first = stream.next();
  await Promise.resolve();
  return { first };
}

describe("events.stream", () => {
  test("emits worker mutations", async () => {
    const { call } = createTestCaller();
    const stream = await call.events.stream();
    const { first } = await subscribed(stream);

    const worker = await call.workers.create({
      name: "w",
      capabilities: { ffmpegVersion: "7", hwaccels: [] },
    });
    await call.workers.update({ id: worker.id, name: "renamed" });
    await call.workers.remove({ id: worker.id });

    const events = [(await first).value];
    for (let i = 0; i < 2; i++) events.push((await stream.next()).value);
    await stream.return?.();

    expect(events).toEqual([
      { resource: "worker", change: "created", id: worker.id },
      { resource: "worker", change: "updated", id: worker.id },
      { resource: "worker", change: "deleted", id: worker.id },
    ]);
  });

  test("emits file updates", async () => {
    const { call, db } = createTestCaller();
    const library = await firstOrThrow(
      db
        .insert(libraries)
        .values({ name: "l", path: "/tmp" })
        .returning({ id: libraries.id }),
    );
    const file = await firstOrThrow(
      db
        .insert(files)
        .values({ libraryId: library.id, path: "/a", size: 1 })
        .returning({ id: files.id }),
    );
    const stream = await call.events.stream();
    const { first } = await subscribed(stream);

    await call.files.update({ id: file.id, ignored: true });

    expect((await first).value).toEqual({
      resource: "file",
      change: "updated",
      id: file.id,
    });
    await stream.return?.();
  });

  test("rejects anonymous callers", () => {
    const { call } = createTestCaller({}, { authenticated: false });
    expect(call.events.stream()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
