import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
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

const LibraryInputSchema = LibrarySchema.omit({ id: true });
const tags = ["libraries"];

export const librariesContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/libraries", tags })
    .input(PaginationSchema)
    .output(pageOf(LibrarySchema)),
  create: orpc
    .route({ method: "POST", path: "/libraries", tags })
    .input(LibraryInputSchema)
    .output(LibrarySchema),
  get: orpc
    .route({ method: "GET", path: "/libraries/{id}", tags })
    .input(z.object({ id: LibraryIdSchema }))
    .output(LibrarySchema),
  update: orpc
    .route({ method: "PATCH", path: "/libraries/{id}", tags })
    .input(LibraryInputSchema.partial().extend({ id: LibraryIdSchema }))
    .output(LibrarySchema),
  remove: orpc
    .route({ method: "DELETE", path: "/libraries/{id}", tags })
    .input(z.object({ id: LibraryIdSchema }))
    .output(z.void()),
});
