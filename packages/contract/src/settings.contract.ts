import { z } from "zod";
import { orpc } from "./orpc";

export const SettingsSchema = z.object({
  auth: z.object({
    username: z.string(),
    apiKey: z.string(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateSchema = z.object({
  auth: SettingsSchema.shape.auth.partial(),
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
