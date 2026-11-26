import { z } from "zod";

const EnvSchema = z.object({
  API_URL: z.url().default("http://localhost:3000"),
  WORKER_TOKEN: z.string().min(1),
  WORK_DIR: z.string().default("../../data/work"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
});

export const env = EnvSchema.parse(Bun.env);
