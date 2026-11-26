import { describe, expect, mock, spyOn, test } from "bun:test";
import type { ApiClient, JobId, JobLogCreate } from "@formatarr/contract";
import { createJobLogger } from "@/lib/logger";

const id = 7 as JobId;

function setup() {
  spyOn(console, "log").mockImplementation(() => {});
  spyOn(console, "error").mockImplementation(() => {});
  const createLog = mock(async (_: JobLogCreate) => {});
  const client = { jobs: { createLog } } as unknown as ApiClient;
  const logger = createJobLogger(client, id, new AbortController().signal);
  const posted = () => createLog.mock.calls.map(([input]) => input.message);
  return { logger, createLog, posted };
}

describe("createJobLogger", () => {
  test("writes to the console and posts the line", async () => {
    const { logger, posted } = setup();

    logger.info("started");
    await logger.flush();

    expect(console.log).toHaveBeenCalledWith("job 7: started");
    expect(posted()).toEqual(["started"]);
  });

  test("groups the lines logged while a post is pending", async () => {
    const { logger, createLog, posted } = setup();
    const pending = Promise.withResolvers<void>();
    createLog.mockImplementationOnce(() => pending.promise);

    logger.info("first");
    await Promise.resolve();
    logger.info("second");
    logger.error("third");
    await Promise.resolve();

    expect(posted()).toEqual(["first"]);

    pending.resolve();
    await logger.flush();

    expect(posted()).toEqual(["first", "second\nthird"]);
  });

  test("keeps posting after a failure", async () => {
    const { logger, createLog, posted } = setup();
    createLog.mockImplementationOnce(async () => {
      throw new Error("ECONNRESET");
    });

    logger.info("lost");
    await logger.flush();
    logger.info("kept");
    await logger.flush();

    expect(posted()).toEqual(["lost", "kept"]);
  });
});
