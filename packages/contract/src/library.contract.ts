import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  UpdateSchema,
  VoidSchema,
} from "./common.contract";
import { IntegrationIdSchema, LibraryIdSchema } from "./ids";
import { orpc } from "./orpc";
import { LibraryRulesSchema, RuleSchema } from "./rule.contract";

export const LibrarySchema = z.object({
  id: LibraryIdSchema,
  name: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  scanCron: z.string().nullable(),
  watch: z.boolean(),
  integrations: z.array(z.object({ id: IntegrationIdSchema })),
  rules: z.array(RuleSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const LibraryCreateSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  enabled: z.boolean(),
  scanCron: z.string().min(1).nullable().optional(),
  watch: z.boolean().optional(),
  integrations: z.array(z.object({ id: IntegrationIdSchema })),
  rules: LibraryRulesSchema.optional(),
});
export type LibraryCreate = z.infer<typeof LibraryCreateSchema>;

export const LibraryUpdateSchema = UpdateSchema(
  LibraryCreateSchema,
  LibraryIdSchema,
);
export type LibraryUpdate = z.infer<typeof LibraryUpdateSchema>;

export const librariesContract = orpc
  .route({ prefix: "/libraries", tags: ["libraries"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(LibrarySchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(LibraryCreateSchema)
      .output(LibrarySchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(LibraryIdSchema))
      .output(LibrarySchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(LibraryUpdateSchema)
      .output(LibrarySchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(LibraryIdSchema))
      .output(VoidSchema),
  });
