import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
import { IntegrationIdSchema } from "./ids";
import { orpc } from "./orpc";

export const IntegrationTypeSchema = z.enum(["radarr", "sonarr"]);

export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  type: IntegrationTypeSchema,
  name: z.string(),
  baseUrl: z.url(),
  apiKey: z.string(),
  enabled: z.boolean(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

const IntegrationInputSchema = IntegrationSchema.omit({ id: true });
const tags = ["integrations"];

export const integrationsContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/integrations", tags })
    .input(PaginationSchema)
    .output(pageOf(IntegrationSchema)),
  create: orpc
    .route({ method: "POST", path: "/integrations", tags })
    .input(IntegrationInputSchema)
    .output(IntegrationSchema),
  get: orpc
    .route({ method: "GET", path: "/integrations/{id}", tags })
    .input(z.object({ id: IntegrationIdSchema }))
    .output(IntegrationSchema),
  update: orpc
    .route({ method: "PATCH", path: "/integrations/{id}", tags })
    .input(IntegrationInputSchema.partial().extend({ id: IntegrationIdSchema }))
    .output(IntegrationSchema),
  remove: orpc
    .route({ method: "DELETE", path: "/integrations/{id}", tags })
    .input(z.object({ id: IntegrationIdSchema }))
    .output(z.void()),
});
