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
    for (const sourcePath of paths) yield { sourcePath } as Task;
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

async function start(connections: Connection[]) {
  for (const connect of connections) {
    stream.mockImplementationOnce(async () => connect());
  }
  const tasks: string[] = [];
  void consumeTasks((task) => tasks.push(task.sourcePath));
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
});
