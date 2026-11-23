import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  UpdateSchema,
  VoidSchema,
} from "./common.contract";
import { IntegrationIdSchema } from "./ids";
import { orpc } from "./orpc";

export const IntegrationTypeSchema = z.enum(["radarr", "sonarr"]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  type: IntegrationTypeSchema,
  name: z.string(),
  baseUrl: z.url(),
  apiKey: z.string(),
  enabled: z.boolean(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const CreateIntegrationInputSchema = IntegrationSchema.omit({
  id: true,
});
export type CreateIntegrationInput = z.infer<
  typeof CreateIntegrationInputSchema
>;

export const integrationsContract = orpc
  .route({ prefix: "/integrations", tags: ["integrations"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(IntegrationSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(CreateIntegrationInputSchema)
      .output(IntegrationSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(IntegrationIdSchema))
      .output(IntegrationSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(UpdateSchema(CreateIntegrationInputSchema, IntegrationIdSchema))
      .output(IntegrationSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(IntegrationIdSchema))
      .output(VoidSchema),
  });
