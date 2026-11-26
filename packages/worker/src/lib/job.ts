import type { ApiClient, JobId, JobUpdate, Task } from "@formatarr/contract";
import { ORPCError } from "@orpc/client";
import { delay } from "es-toolkit";
import type { Transcode } from "@/lib/ffmpeg/run";
import { processTask, type TransferContext } from "@/lib/transfer";

const HEARTBEAT_INTERVAL = 2000;

type JobContext = TransferContext & { transcode: Transcode };

type Heartbeat = {
  id: JobId;
  progress: () => number;
  signal: AbortSignal;
  onGone: () => void;
};

function isNotFound(error: unknown) {
  return error instanceof ORPCError && error.code === "NOT_FOUND";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sendHeartbeats(
  client: ApiClient,
  { id, progress, signal, onGone }: Heartbeat,
) {
  while (!signal.aborted) {
    try {
      await delay(HEARTBEAT_INTERVAL, { signal });
      await client.jobs.update({ id, progress: progress() }, { signal });
    } catch (error) {
      if (signal.aborted) return;
      if (isNotFound(error)) return onGone();
      console.error(`job ${id} heartbeat failed:`, errorMessage(error));
    }
  }
}

async function reportFailure(
  client: ApiClient,
  update: JobUpdate,
  signal: AbortSignal,
) {
  for (let attempts = 0; !signal.aborted; attempts++) {
    try {
      await client.jobs.update(update, { signal });
      return;
    } catch (error) {
      if (signal.aborted || isNotFound(error)) return;
      console.error(`job ${update.id} report failed:`, errorMessage(error));
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
  let progress = 0;
  void sendHeartbeats(context.client, {
    id,
    progress: () => progress,
    signal: AbortSignal.any([jobSignal, finished.signal]),
    onGone: () => cancellation.abort(),
  });
  try {
    await processTask(context, task, transcode, {
      signal: jobSignal,
      onProgress: (value) => {
        progress = value;
      },
    });
  } catch (error) {
    finished.abort();
    if (jobSignal.aborted) return;
    const message = errorMessage(error);
    console.error(`job ${id} failed:`, message);
    await reportFailure(
      context.client,
      { id, progress, status: "failed", error: message },
      signal,
    );
  } finally {
    finished.abort();
  }
}
