import { describe, expect, test } from "bun:test";
import type { AppEvent, WorkerId } from "@formatarr/contract";
import { eq } from "drizzle-orm";
import { files, jobs } from "@/db/schema";
import { claimTask, dispatchTasks, requeueJobs } from "@/task/task.lib";
import { createTestContext } from "@/testing/harness";
import {
  seedFile,
  seedJob,
  seedLibrary,
  seedRule,
  seedWorker,
} from "@/testing/seed";

function setup() {
  const context = createTestContext();
  const { db } = context;
  const library = seedLibrary(db);
  const worker = seedWorker(db);
  const other = seedWorker(db, { tokenHash: "other" });
  const queue = (values: Parameters<typeof seedFile>[2] = {}) => {
    const file = seedFile(db, library.id, { status: "queued", ...values });
    return { file, job: seedJob(db, file.id) };
  };
  const assign = (workerId: WorkerId, status: "running" | "failed") => {
    const file = seedFile(db, library.id, { status: "processing" });
    return { file, job: seedJob(db, file.id, [], { workerId, status }) };
  };
  const jobRow = (id: number) =>
    db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id as never))
      .get();
  const fileRow = (id: number) =>
    db
      .select()
      .from(files)
      .where(eq(files.id, id as never))
      .get();
  const published: AppEvent[] = [];
  const publish = context.events.publish.bind(context.events);
  context.events.publish = async (name, event) => {
    published.push(event);
    await publish(name, event);
  };
  const connect = (id: WorkerId) => {
    const messages = context.workers.connect(id);
    if (!messages) throw new Error("already connected");
    return async () => {
      const { value } = await messages.next();
      return value?.type === "task" ? value.task.job.id : value?.type;
    };
  };
  return {
    context,
    db,
    library,
    worker,
    other,
    queue,
    assign,
    jobRow,
    fileRow,
    published,
    connect,
  };
}

describe("claimTask", () => {
  test("assigns the oldest queued job to the worker", () => {
    const { context, db, library, worker, queue, fileRow } = setup();
    const rule = seedRule(db, library.id);
    const file = seedFile(db, library.id, { status: "queued" });
    const first = seedJob(db, file.id, [rule.id]);
    queue();

    const task = claimTask(context.db, worker.id);

    expect(task).toMatchObject({
      sourcePath: file.path,
      job: {
        id: first.id,
        status: "running",
        workerId: worker.id,
        startedAt: new Date(),
        rules: [{ id: rule.id }],
      },
    });
    expect(fileRow(file.id)?.status).toBe("processing");
  });

  test("returns nothing when the queue is empty", () => {
    const { context, worker } = setup();

    expect(claimTask(context.db, worker.id)).toBeUndefined();
  });

  test("does not exceed the worker capacity", () => {
    const { context, worker, queue } = setup();
    queue();
    queue();

    expect(claimTask(context.db, worker.id)).toBeDefined();
    expect(claimTask(context.db, worker.id)).toBeUndefined();
  });

  test("never gives the same job to two workers", () => {
    const { context, worker, other, queue } = setup();
    queue();

    expect(claimTask(context.db, worker.id)).toBeDefined();
    expect(claimTask(context.db, other.id)).toBeUndefined();
  });

  test("skips ignored files and disabled libraries", () => {
    const { context, db, worker, queue } = setup();
    queue({ ignored: true });
    const disabled = seedLibrary(db, { enabled: false });
    seedJob(db, seedFile(db, disabled.id, { status: "queued" }).id);

    expect(claimTask(context.db, worker.id)).toBeUndefined();
  });
});

describe("requeueJobs", () => {
  test("releases every running job without a worker", () => {
    const { db, worker, other, assign, jobRow } = setup();
    const first = assign(worker.id, "running");
    const second = assign(other.id, "running");

    db.transaction((tx) => requeueJobs(tx));

    expect(jobRow(first.job.id)?.status).toBe("queued");
    expect(jobRow(second.job.id)?.status).toBe("queued");
  });

  test("only releases the running jobs of the worker", () => {
    const { db, worker, other, assign, jobRow, fileRow } = setup();
    const mine = assign(worker.id, "running");
    const failed = assign(worker.id, "failed");
    const theirs = assign(other.id, "running");

    const requeued = db.transaction((tx) => requeueJobs(tx, worker.id));

    expect(requeued).toEqual([{ id: mine.job.id, fileId: mine.file.id }]);
    expect(jobRow(mine.job.id)).toMatchObject({
      status: "queued",
      workerId: null,
    });
    expect(fileRow(mine.file.id)?.status).toBe("queued");
    expect(jobRow(failed.job.id)?.status).toBe("failed");
    expect(jobRow(theirs.job.id)?.status).toBe("running");
  });
});

describe("dispatchTasks", () => {
  test("publishes the updates of the assigned jobs", async () => {
    const { context, worker, queue, connect, published } = setup();
    connect(worker.id);
    const { file, job } = queue();

    await dispatchTasks(context);

    expect(published).toEqual([
      { resource: "job", change: "updated", id: job.id },
      { resource: "file", change: "updated", id: file.id },
    ]);
  });

  test("publishes nothing when the queue is empty", async () => {
    const { context, worker, connect, published } = setup();
    connect(worker.id);

    await dispatchTasks(context);

    expect(published).toEqual([]);
  });

  test("alternates between the connected workers", async () => {
    const { context, worker, other, queue, connect, jobRow } = setup();
    const first = connect(worker.id);
    const second = connect(other.id);
    const one = queue();

    await dispatchTasks(context);

    expect(await first()).toBe(one.job.id);
    context.db.delete(jobs).run();
    const two = queue();

    await dispatchTasks(context);

    expect(await second()).toBe(two.job.id);
    context.db.delete(jobs).run();
    const three = queue();

    await dispatchTasks(context);

    expect(await first()).toBe(three.job.id);
    expect(jobRow(three.job.id)?.workerId).toBe(worker.id);
  });

  test("gives one job to each free worker", async () => {
    const { context, worker, other, queue, connect, jobRow } = setup();
    const first = connect(worker.id);
    const second = connect(other.id);
    const jobsQueued = [queue(), queue(), queue()];

    await dispatchTasks(context);
    await dispatchTasks(context);

    expect(await first()).toBe(jobsQueued[0]?.job.id);
    expect(await second()).toBe(jobsQueued[1]?.job.id);
    expect(jobRow(jobsQueued[2]?.job.id as number)?.status).toBe("queued");
  });

  test("leaves jobs queued without a connected worker", async () => {
    const { context, queue, jobRow } = setup();
    const { job } = queue();

    await dispatchTasks(context);

    expect(jobRow(job.id)?.status).toBe("queued");
  });

  test("skips disabled workers", async () => {
    const { context, db, queue, connect, jobRow } = setup();
    const disabled = seedWorker(db, { tokenHash: "off", enabled: false });
    connect(disabled.id);
    const { job } = queue();

    await dispatchTasks(context);

    expect(jobRow(job.id)?.status).toBe("queued");
  });
});
