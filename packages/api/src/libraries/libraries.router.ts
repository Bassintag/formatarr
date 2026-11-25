import type { LibraryId } from "@formatarr/contract";
import { count, eq } from "drizzle-orm";
import { libraries } from "@/db/schema";
import { firstOrThrow, orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import {
  assertCron,
  assertDirectory,
  setIntegrations,
} from "@/libraries/library.lib";
import { libraryOptions } from "@/libraries/library.options";

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
  assertCron(input.scanCron);
  const { integrations, ...values } = input;
  const id = context.db.transaction((tx) => {
    const { lastInsertRowid } = tx.insert(libraries).values(values).run();
    const libraryId = Number(lastInsertRowid) as LibraryId;
    setIntegrations(tx, libraryId, integrations);
    return libraryId;
  });
  const created = await orThrow(
    context.db.query.libraries.findFirst({
      ...libraryOptions,
      where: { id },
    }),
  );
  context.schedulers.scan.update(created);
  return created;
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
  assertCron(changes.scanCron);
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
  const updated = await orThrow(
    context.db.query.libraries.findFirst({
      ...libraryOptions,
      where: { id },
    }),
  );
  context.schedulers.scan.update(updated);
  return updated;
});

const remove = orpc.libraries.remove.handler(async ({ context, input }) => {
  const removed = await firstOrThrow(
    context.db
      .delete(libraries)
      .where(eq(libraries.id, input.id))
      .returning({ id: libraries.id }),
  );
  context.schedulers.scan.remove(removed.id);
});

export const librariesRouter = orpc.libraries.router({
  list,
  create,
  get,
  update,
  remove,
});
