import { env } from "@/lib/env";
import { detectAccelerators } from "@/lib/ffmpeg/encoders";
import { createTranscoder } from "@/lib/ffmpeg/run";
import { runJob } from "@/lib/job";
import { client } from "@/lib/orpc";
import { consumeTasks } from "@/lib/task";

const accelerators = env.HARDWARE_ACCELERATION
  ? await detectAccelerators(env.FFMPEG_PATH)
  : {};
console.log("hardware encoders:", accelerators);

const context = {
  client,
  workDir: env.WORK_DIR,
  transcode: createTranscoder(env.FFMPEG_PATH, accelerators),
};

await consumeTasks((task, signal) => runJob(context, task, signal));
