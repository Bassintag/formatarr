import type { LibraryId } from "@formatarr/contract";
import { count, eq } from "drizzle-orm";
import { libraries } from "@/db/schema";
import { firstOrThrow, orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { assertDirectory, setIntegrations } from "@/libraries/library.lib";
import { libraryOptions } from "./library.options";

const list = orpc.libraries.list.handler(async ({ context, input }) => {
  return toPage(
    context.db.query.libraries.findMany({
      ...libraryOptions,
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(libraries),
  );
});

const create = orpc.libraries.create.handler(async ({ context, input }) => {
  await assertDirectory(input.path);
  const { integrations, ...values } = input;
  const id = context.db.transaction((tx) => {
    const { lastInsertRowid } = tx.insert(libraries).values(values).run();
    const libraryId = Number(lastInsertRowid) as LibraryId;
    setIntegrations(tx, libraryId, integrations);
    return libraryId;
  });
  return orThrow(
    context.db.query.libraries.findFirst({
      ...libraryOptions,
      where: { id },
    }),
  );
});

const get = orpc.libraries.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.libraries.findFirst({
      ...libraryOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.libraries.update.handler(async ({ context, input }) => {
  const { id, integrations, ...changes } = input;
  if (changes.path !== undefined) await assertDirectory(changes.path);
  await orThrow(
    context.db.query.libraries.findFirst({
      columns: { id: true },
      where: { id },
    }),
  );
  context.db.transaction((tx) => {
    if (Object.values(changes).some((value) => value !== undefined)) {
      tx.update(libraries).set(changes).where(eq(libraries.id, id)).run();
    }
    if (integrations !== undefined) {
      setIntegrations(tx, id, integrations);
    }
  });
  return orThrow(
    context.db.query.libraries.findFirst({
      ...libraryOptions,
      where: { id },
    }),
  );
});

const remove = orpc.libraries.remove.handler(async ({ context, input }) => {
  await firstOrThrow(
    context.db
      .delete(libraries)
      .where(eq(libraries.id, input.id))
      .returning({ id: libraries.id }),
  );
});

export const librariesRouter = orpc.libraries.router({
  list,
  create,
  get,
  update,
  remove,
});
