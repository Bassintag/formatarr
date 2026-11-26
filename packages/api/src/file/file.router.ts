import { count, eq, like, type SQL } from "drizzle-orm";
import { userAuth } from "@/auth/auth.middleware";
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
import { dispatchTasks } from "@/task/task.lib";

const userFiles = orpc.files.use(userAuth);

const list = userFiles.list.handler(({ context, input }) => {
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

const get = userFiles.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.files
      .findFirst({ ...fileOptions, where: { id: input.id } })
      .sync(),
  );
});

const update = userFiles.update.handler(async ({ context, input }) => {
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
  if (!ignored) await dispatchTasks(context);
  return orThrow(
    context.db.query.files.findFirst({ ...fileOptions, where: { id } }).sync(),
  );
});

export const filesRouter = orpc.files.router({ list, get, update });
