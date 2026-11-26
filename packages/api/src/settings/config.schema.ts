import { JobSettingsSchema } from "@formatarr/contract";
import { z } from "zod";

function generateSecret() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}

const { maxRetries, timeoutSeconds } = JobSettingsSchema.shape;

export const ConfigSchema = z.object({
  jobs: z
    .object({
      maxRetries: maxRetries.default(2),
      timeoutSeconds: timeoutSeconds.default(60),
    })
    .prefault({}),
  auth: z
    .object({
      username: z.string().default(""),
      passwordHash: z.string().default(""),
      jwtSecret: z.string().min(1).default(generateSecret),
      apiKey: z.string().min(1).default(generateSecret),
    })
    .prefault({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export type ConfigUpdate = {
  auth?: Partial<Config["auth"]>;
  jobs?: Partial<Config["jobs"]>;
};
