import z from "zod";

export function createEnv() {
  const EnvSchema = z.object({
    API_PORT: z.coerce.number().default(3000),
    DATA_DIR: z.string().default("../../data"),
    DATABASE_URL: z.string().default("../../data/formatarr.db"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  });

  return EnvSchema.parse(Bun.env);
}

export type Env = ReturnType<typeof createEnv>;
