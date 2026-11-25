import { count, eq, like, type SQL } from "drizzle-orm";
import { files } from "@/db/schema";
import { fileOptions } from "@/file/file.options";
import {
  buildWhere,
  firstOrThrow,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";

const list = orpc.files.list.handler(({ context, input }) => {
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
    return buildWhere(conditions);
  }

  return toPage(
    context.db.query.files
      .findMany({
        ...fileOptions,
        where: { RAW: where },
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(files).where(where(files)).all(),
  );
});

const get = orpc.files.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.files
      .findFirst({ ...fileOptions, where: { id: input.id } })
      .sync(),
  );
});

const update = orpc.files.update.handler(async ({ context, input }) => {
  const { id, ignored } = input;
  firstOrThrow(
    context.db
      .update(files)
      .set({ ignored })
      .where(eq(files.id, id))
      .returning({ id: files.id })
      .all(),
  );
  await context.events.publish("event", {
    resource: "file",
    change: "updated",
    id,
  });
  return orThrow(
    context.db.query.files.findFirst({ ...fileOptions, where: { id } }).sync(),
  );
});

export const filesRouter = orpc.files.router({ list, get, update });
