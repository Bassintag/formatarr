import type { ApiClient, JobId, JobUpdate, Task } from "@formatarr/contract";
import { ORPCError } from "@orpc/client";
import { delay } from "es-toolkit";
import type { Transcode } from "@/lib/ffmpeg/run";
import { createJobLogger, errorMessage, type JobLogger } from "@/lib/logger";
import { processTask, type TransferContext } from "@/lib/transfer";

const HEARTBEAT_INTERVAL = 2000;

type JobContext = TransferContext & { transcode: Transcode };

type Heartbeat = {
  id: JobId;
  progress: () => number;
  signal: AbortSignal;
  onGone: () => void;
  logger: JobLogger;
};

function isNotFound(error: unknown) {
  return error instanceof ORPCError && error.code === "NOT_FOUND";
}

async function sendHeartbeats(
  client: ApiClient,
  { id, progress, signal, onGone, logger }: Heartbeat,
) {
  while (!signal.aborted) {
    try {
      await delay(HEARTBEAT_INTERVAL, { signal });
      await client.jobs.update({ id, progress: progress() }, { signal });
    } catch (error) {
      if (signal.aborted) return;
      if (isNotFound(error)) return onGone();
      logger.error(`Heartbeat failed: ${errorMessage(error)}`);
    }
  }
}

async function reportFailure(
  client: ApiClient,
  update: JobUpdate,
  signal: AbortSignal,
  logger: JobLogger,
) {
  for (let attempts = 0; !signal.aborted; attempts++) {
    try {
      await client.jobs.update(update, { signal });
      return;
    } catch (error) {
      if (signal.aborted || isNotFound(error)) return;
      logger.error(`Report failed: ${errorMessage(error)}`);
      const backoff = Math.min(100 * 2 ** attempts, 10_000);
      await delay(backoff, { signal }).catch(() => {});
    }
  }
}

export async function runJob(
  { transcode, ...context }: JobContext,
  task: Task,
  signal: AbortSignal,
) {
  if (signal.aborted) return;
  const { id } = task.job;
  const cancellation = new AbortController();
  const finished = new AbortController();
  const jobSignal = AbortSignal.any([signal, cancellation.signal]);
  const logger = createJobLogger(context.client, id, jobSignal);
  let progress = 0;
  void sendHeartbeats(context.client, {
    id,
    progress: () => progress,
    signal: AbortSignal.any([jobSignal, finished.signal]),
    onGone: () => cancellation.abort(),
    logger,
  });
  try {
    await processTask(context, task, transcode, {
      signal: jobSignal,
      logger,
      onProgress: (value) => {
        progress = value;
      },
    });
  } catch (error) {
    if (jobSignal.aborted) return;
    const message = errorMessage(error);
    console.error(`job ${id} failed:`, message);
    await logger.flush();
    finished.abort();
    await reportFailure(
      context.client,
      { id, progress, status: "failed", error: message },
      signal,
      logger,
    );
  } finally {
    finished.abort();
  }
}
