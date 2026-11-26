import { z } from "zod";

const EnvSchema = z.object({
  API_URL: z.url().default("http://localhost:3000"),
  WORKER_TOKEN: z.string().min(1),
});

export const env = EnvSchema.parse(Bun.env);
