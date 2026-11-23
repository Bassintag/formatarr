import { z } from "zod";
import { orpc, publicMeta } from "./orpc";

export const HealthSchema = z.object({
  status: z.literal("ok"),
  time: z.date(),
});
export type Health = z.infer<typeof HealthSchema>;

export const healthContract = orpc.router({
  check: orpc
    .meta(publicMeta)
    .route({ method: "GET", path: "/health" })
    .output(HealthSchema),
});
