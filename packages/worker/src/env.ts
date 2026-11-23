import z from "zod";

export function createEnv() {
  const EnvSchema = z.object({
    API_URL: z.url().default("http://localhost:3000"),
  });

  return EnvSchema.parse(Bun.env);
}

export type Env = ReturnType<typeof createEnv>;
