import { and, count, eq, like, type SQL, sql } from "drizzle-orm";
import { files } from "@/db/schema";
import { orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { fileOptions } from "./file.options";

const list = orpc.files.list.handler(async ({ context, input }) => {
  function where(table: typeof files) {
    const conditions: SQL[] = [];
    if (input.libraryId) {
      conditions.push(eq(table.libraryId, input.libraryId));
    }
    if (input.status) {
      conditions.push(eq(table.status, input.status));
    }
    if (input.search) {
      conditions.push(like(table.path, `%${input.search}%`));
    }
    return and(...conditions) ?? sql`true`;
  }

  return toPage(
    context.db.query.files.findMany({
      ...fileOptions,
      where: { RAW: where },
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(files).where(where(files)),
  );
});

const get = orpc.files.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.files.findFirst({
      ...fileOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.files.update.handler(async ({ context, input }) => {
  const { id, ignored } = input;
  await orThrow(
    context.db.query.files.findFirst({ columns: { id: true }, where: { id } }),
  );
  context.db.update(files).set({ ignored }).where(eq(files.id, id)).run();
  return orThrow(
    context.db.query.files.findFirst({ ...fileOptions, where: { id } }),
  );
});

export const filesRouter = orpc.files.router({ list, get, update });
