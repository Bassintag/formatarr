import z from "zod";

function generateSecret() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64url",
  );
}

export const ConfigSchema = z.object({
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

export type ConfigUpdate = { auth?: Partial<Config["auth"]> };
