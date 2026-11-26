import { buildFfmpegArgs, type TranscodeInput } from "@/lib/ffmpeg/command";
import type { Accelerators } from "@/lib/ffmpeg/encoders";
import type { JobLogger } from "@/lib/logger";

const STDERR_TAIL_LENGTH = 4096;

export type TranscodeOptions = {
  signal: AbortSignal;
  onProgress: (progress: number) => void;
  logger: JobLogger;
};

export type Transcode = (
  input: TranscodeInput,
  options: TranscodeOptions,
) => Promise<void>;

async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
) {
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop() ?? "";
    lines.forEach(onLine);
  }
  rest += decoder.decode();
  if (rest) onLine(rest);
}

function parseProgress(line: string, durationSeconds: number) {
  const time = line.match(/^out_time_us=(\d+)/)?.[1];
  if (!time || durationSeconds <= 0) return;
  const percent = Math.floor(Number(time) / (durationSeconds * 10_000));
  return Math.min(percent, 99);
}

export function createTranscoder(
  ffmpegPath: string,
  accelerators: Accelerators = {},
): Transcode {
  return async (input, { signal, onProgress, logger }) => {
    signal.throwIfAborted();
    const command = [
      ffmpegPath,
      "-nostdin",
      "-v",
      "error",
      "-nostats",
      "-progress",
      "pipe:1",
      ...buildFfmpegArgs(input, accelerators),
    ];
    logger.info(command.join(" "));
    const ffmpeg = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    let stderr = "";
    const [, , code] = await Promise.all([
      readLines(ffmpeg.stdout, (line) => {
        const progress = parseProgress(line, input.mediaInfo.durationSeconds);
        if (progress !== undefined) onProgress(progress);
      }),
      readLines(ffmpeg.stderr, (line) => {
        if (!line.trim()) return;
        stderr = `${stderr}\n${line}`.slice(-STDERR_TAIL_LENGTH);
        logger.error(line);
      }),
      ffmpeg.exited,
    ]);
    signal.throwIfAborted();
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`);
    }
  };
}
