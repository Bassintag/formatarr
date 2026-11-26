import { z } from "zod";
import { orpc } from "./orpc";

export const JobSettingsSchema = z.object({
  maxRetries: z.int().nonnegative(),
  timeoutSeconds: z.int().positive(),
});
export type JobSettings = z.infer<typeof JobSettingsSchema>;

export const SettingsSchema = z.object({
  jobs: JobSettingsSchema,
  auth: z.object({
    username: z.string(),
    apiKey: z.string(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateSchema = z.object({
  auth: SettingsSchema.shape.auth.partial().optional(),
  jobs: JobSettingsSchema.partial().optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export const settingsContract = orpc
  .route({ prefix: "/settings", tags: ["settings"] })
  .router({
    get: orpc.route({ method: "GET", path: "/" }).output(SettingsSchema),
    update: orpc
      .route({ method: "PATCH", path: "/" })
      .input(SettingsUpdateSchema)
      .output(SettingsSchema),
  });
