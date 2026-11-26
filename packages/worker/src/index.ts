import { env } from "@/lib/env";
import { createTranscoder } from "@/lib/ffmpeg/run";
import { runJob } from "@/lib/job";
import { client } from "@/lib/orpc";
import { consumeTasks } from "@/lib/task";

const context = {
  client,
  workDir: env.WORK_DIR,
  transcode: createTranscoder(env.FFMPEG_PATH),
};

await consumeTasks((task, signal) => runJob(context, task, signal));
