import { z } from "zod";

export function createEnv() {
  const EnvSchema = z.object({
    API_PORT: z.coerce.number().default(3000),
    DATA_DIR: z.string().default("../../data"),
    DATABASE_URL: z.string().default("../../data/formatarr.db"),
    FFPROBE_PATH: z.string().default("ffprobe"),
    PROBE_CONCURRENCY: z.coerce.number().int().min(1).default(4),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  });

  return EnvSchema.parse(Bun.env);
}
