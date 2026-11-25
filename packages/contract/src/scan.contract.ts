import { z } from "zod";
import { VoidSchema } from "./common.contract";
import { LibraryIdSchema } from "./ids";
import { orpc } from "./orpc";

export const ScanCreateSchema = z.object({ libraryId: LibraryIdSchema });
export type ScanCreate = z.infer<typeof ScanCreateSchema>;

export const scansContract = orpc
  .route({ prefix: "/scans", tags: ["scans"] })
  .router({
    create: orpc
      .route({
        method: "POST",
        path: "/",
        successStatus: 202,
      })
      .input(ScanCreateSchema)
      .output(VoidSchema),
  });
