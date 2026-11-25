import { z } from "zod";

const EnvSchema = z.object({
  API_URL: z.url().default("http://localhost:3000"),
});

export function createEnv() {
  return EnvSchema.parse(Bun.env);
}
