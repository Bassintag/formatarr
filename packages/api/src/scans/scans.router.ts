import { orThrow } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { scanLibrary } from "./scans.lib";

const create = orpc.scans.create.handler(async ({ context, input }) => {
  await orThrow(
    context.db.query.libraries.findFirst({
      columns: { id: true },
      where: { id: input.libraryId },
    }),
  );
  scanLibrary(context, input.libraryId).catch((error) => {
    context.logger.error(
      { err: error, libraryId: input.libraryId },
      "scan failed",
    );
  });
});

export const scansRouter = orpc.scans.router({ create });
