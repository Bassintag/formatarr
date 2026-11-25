import { orThrow } from "@/lib/db";
import { orpc } from "@/lib/orpc";

const create = orpc.scans.create.handler(async ({ context, input }) => {
  await orThrow(
    context.db.query.libraries.findFirst({
      columns: { id: true },
      where: { id: input.libraryId },
    }),
  );
  void context.schedulers.scan.scan(input.libraryId);
});

export const scansRouter = orpc.scans.router({ create });
