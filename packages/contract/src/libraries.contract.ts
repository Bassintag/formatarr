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

export const LibrarySchema = z.object({
  id: LibraryIdSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  enabled: z.boolean(),
  integrationIds: z.array(IntegrationIdSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const CreateLibraryInputSchema = LibrarySchema.omit({ id: true });
export type CreateLibraryInput = z.infer<typeof CreateLibraryInputSchema>;

export const librariesContract = orpc
  .route({ prefix: "/libraries", tags: ["libraries"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(PaginationSchema)
      .output(PageSchema(LibrarySchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(CreateLibraryInputSchema)
      .output(LibrarySchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(LibraryIdSchema))
      .output(LibrarySchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(UpdateSchema(CreateLibraryInputSchema, LibraryIdSchema))
      .output(LibrarySchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(LibraryIdSchema))
      .output(VoidSchema),
  });
