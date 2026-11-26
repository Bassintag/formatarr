import {
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Task } from "@formatarr/contract";

type Connection = () => AsyncGenerator<Task>;

const stream = mock<() => Promise<AsyncGenerator<Task>>>();

mock.module("@/lib/orpc", () => ({ client: { tasks: { stream } } }));

const { consumeTasks } = await import("@/lib/task");

function connection(paths: string[] = [], error?: Error): Connection {
  return async function* () {
    for (const fileName of paths) yield { fileName } as Task;
    if (error) throw error;
  };
}

const unreachable: Connection = () => {
  throw new Error("ECONNREFUSED");
};

async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

type Handler = (task: Task, signal: AbortSignal) => Promise<void>;

async function start(
  connections: Connection[],
  onTask: Handler = async () => {},
) {
  for (const connect of connections) {
    stream.mockImplementationOnce(async () => connect());
  }
  const tasks: string[] = [];
  void consumeTasks(async (task, signal) => {
    tasks.push(task.fileName);
    await onTask(task, signal);
  });
  await advance(0);
  return tasks;
}

describe("consumeTasks", () => {
  let logged: unknown[];

  beforeEach(() => {
    logged = [];
    spyOn(console, "error").mockImplementation((_, message) => {
      logged.push(message);
    });
    stream.mockReset();
    stream.mockImplementation(() => new Promise(() => {}));
  });

  test("forwards tasks across reconnections", async () => {
    const tasks = await start([
      connection(["a", "b"]),
      unreachable,
      connection(["c"], new Error("ECONNRESET")),
    ]);

    await advance(100);
    await advance(200);

    expect(tasks).toEqual(["a", "b", "c"]);
  });

  test("reconnects after any kind of failure and logs it", async () => {
    await start([
      connection(),
      unreachable,
      connection([], new Error("CONFLICT")),
    ]);

    await advance(100);
    await advance(200);
    await advance(400);

    expect(stream).toHaveBeenCalledTimes(4);
    expect(logged).toEqual(["task stream closed", "ECONNREFUSED", "CONFLICT"]);
  });

  test("backs off exponentially up to 10 seconds, without giving up", async () => {
    const delays = [100, 200, 400, 800, 1600, 3200, 6400, 10_000, 10_000];
    await start(delays.map(() => unreachable));

    for (const [index, delay] of delays.entries()) {
      await advance(delay - 1);
      expect(stream).toHaveBeenCalledTimes(index + 1);
      await advance(1);
      expect(stream).toHaveBeenCalledTimes(index + 2);
    }
  });

  test.each([
    ["drops", new Error("ECONNRESET")],
    ["closes", undefined],
  ])("aborts the running task when the stream %s", async (_, error) => {
    const signals: AbortSignal[] = [];
    await start([connection(["a"], error)], async (_, signal) => {
      signals.push(signal);
      await new Promise((resolve) => signal.addEventListener("abort", resolve));
    });

    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
  });

  test("runs one task at a time without blocking the stream", async () => {
    const first = Promise.withResolvers<void>();
    const open = Promise.withResolvers<void>();
    let received = 0;
    const tasks = await start(
      [
        async function* () {
          for (const fileName of ["a", "b"]) {
            received++;
            yield { fileName } as Task;
          }
          await open.promise;
        },
      ],
      async ({ fileName }) => {
        if (fileName === "a") await first.promise;
      },
    );

    expect(received).toBe(2);
    expect(tasks).toEqual(["a"]);

    first.resolve();
    await advance(0);

    expect(tasks).toEqual(["a", "b"]);
  });

  test("reconnects only once the running task has stopped", async () => {
    const teardown = Promise.withResolvers<void>();
    await start([connection(["a"])], () => teardown.promise);

    await advance(10_000);
    expect(stream).toHaveBeenCalledTimes(1);

    teardown.resolve();
    await advance(0);
    await advance(100);
    expect(stream).toHaveBeenCalledTimes(2);
  });

  test("keeps running tasks after one of them throws", async () => {
    const open = Promise.withResolvers<void>();
    const tasks = await start(
      [
        async function* () {
          yield { fileName: "a" } as Task;
          yield { fileName: "b" } as Task;
          await open.promise;
        },
      ],
      async () => {
        throw new Error("boom");
      },
    );

    expect(tasks).toEqual(["a", "b"]);
  });
});
