import z from "zod";
import { orpc } from "./orpc";

export const SettingsSchema = z.object({
  auth: z.object({
    username: z.string(),
    apiKey: z.string(),
  }),
});

export const SettingsUpdateSchema = z.object({
  auth: SettingsSchema.shape.auth.partial(),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

const tags = ["settings"];

export const settingsContract = orpc.router({
  get: orpc
    .route({ method: "GET", path: "/settings", tags })
    .output(SettingsSchema),
  update: orpc
    .route({ method: "PATCH", path: "/settings", tags })
    .input(SettingsUpdateSchema)
    .output(SettingsSchema),
});
