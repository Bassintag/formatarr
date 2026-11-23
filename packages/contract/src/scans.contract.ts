import { z } from "zod";
import { LibraryIdSchema } from "./ids";
import { orpc } from "./orpc";

export const scansContract = orpc.router({
  create: orpc
    .route({
      method: "POST",
      path: "/scans",
      successStatus: 202,
      tags: ["scans"],
    })
    .input(z.object({ libraryId: LibraryIdSchema }))
    .output(z.void()),
});
