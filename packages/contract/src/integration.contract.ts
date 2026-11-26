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

const MASK = "••••";
const VISIBLE_SUFFIX = 4;

function maskApiKey(apiKey: string) {
  if (apiKey.length <= VISIBLE_SUFFIX * 2) return MASK;
  return `${MASK}${apiKey.slice(-VISIBLE_SUFFIX)}`;
}

export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  type: IntegrationTypeSchema,
  name: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().transform(maskApiKey),
  enabled: z.boolean(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const IntegrationCreateSchema = z.object({
  type: IntegrationTypeSchema,
  name: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
  enabled: z.boolean(),
});
export type IntegrationCreate = z.infer<typeof IntegrationCreateSchema>;

export const IntegrationUpdateSchema = UpdateSchema(
  IntegrationCreateSchema,
  IntegrationIdSchema,
);
export type IntegrationUpdate = z.infer<typeof IntegrationUpdateSchema>;

export const IntegrationTestSchema = z.object({ version: z.string() });
export type IntegrationTest = z.infer<typeof IntegrationTestSchema>;

export const integrationsContract = orpc
  .route({ prefix: "/integrations", tags: ["integrations"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(IntegrationSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(IntegrationCreateSchema)
      .output(IntegrationSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(IntegrationIdSchema))
      .output(IntegrationSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(IntegrationUpdateSchema)
      .output(IntegrationSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(IntegrationIdSchema))
      .output(VoidSchema),
    test: orpc
      .route({ method: "POST", path: "/{id}/test" })
      .input(IdParamsSchema(IntegrationIdSchema))
      .output(IntegrationTestSchema),
  });
