import { z } from "zod";
import { VoidSchema } from "./common.contract";
import { LibraryIdSchema } from "./ids";
import { orpc } from "./orpc";

export const CreateScanInputSchema = z.object({ libraryId: LibraryIdSchema });
export type CreateScanInput = z.infer<typeof CreateScanInputSchema>;

export const scansContract = orpc
  .route({ prefix: "/scans", tags: ["scans"] })
  .router({
    create: orpc
      .route({
        method: "POST",
        path: "/",
        successStatus: 202,
      })
      .input(CreateScanInputSchema)
      .output(VoidSchema),
  });
