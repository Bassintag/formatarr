import type { ApiClient, JobId } from "@formatarr/contract";

const POST_TIMEOUT = 10_000;

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createJobLogger(
  client: ApiClient,
  id: JobId,
  signal: AbortSignal,
) {
  let queued: string[] = [];
  let sending = Promise.resolve();

  async function send() {
    const message = queued.join("\n");
    queued = [];
    try {
      await client.jobs.createLog(
        { id, message },
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(POST_TIMEOUT)]),
        },
      );
    } catch (error) {
      if (signal.aborted) return;
      console.error(`job ${id} log failed:`, errorMessage(error));
    }
  }

  function enqueue(message: string) {
    if (queued.push(message) === 1) sending = sending.then(send);
  }

  return {
    info(message: string) {
      console.log(`job ${id}: ${message}`);
      enqueue(message);
    },
    error(message: string) {
      console.error(`job ${id}: ${message}`);
      enqueue(message);
    },
    flush: () => sending,
  };
}

export type JobLogger = ReturnType<typeof createJobLogger>;
