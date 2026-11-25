import type { Library } from "@formatarr/contract";
import { count, eq } from "drizzle-orm";
import { libraries } from "@/db/schema";
import { reevaluateLibrary } from "@/job/job.lib";
import {
  firstOrThrow,
  hasChanges,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";
import {
  assertCron,
  assertDirectory,
  setIntegrations,
  setRules,
} from "@/library/library.lib";
import { libraryOptions } from "@/library/library.options";

const list = orpc.libraries.list.handler(({ context, input }) => {
  const page = toPage(
    context.db.query.libraries
      .findMany({
        ...libraryOptions,
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(libraries).all(),
  );
  return { ...page, items: page.items as Library[] };
});

const create = orpc.libraries.create.handler(async ({ context, input }) => {
  await assertDirectory(input.path);
  assertCron(input.scanCron);
  const { integrations, rules, ...values } = input;
  const { id } = context.db.transaction((tx) => {
    const row = tx
      .insert(libraries)
      .values(values)
      .returning({ id: libraries.id })
      .get();
    setIntegrations(tx, row.id, integrations);
    if (rules !== undefined) setRules(tx, row.id, rules);
    return row;
  });
  const created = orThrow(
    context.db.query.libraries
      .findFirst({ ...libraryOptions, where: { id } })
      .sync(),
  ) as Library;
  context.schedulers.scan.update(created);
  return created;
});

const get = orpc.libraries.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.libraries
      .findFirst({
        ...libraryOptions,
        where: { id: input.id },
      })
      .sync(),
  ) as Library;
});

const update = orpc.libraries.update.handler(async ({ context, input }) => {
  const { id, integrations, rules, ...changes } = input;
  if (changes.path !== undefined) await assertDirectory(changes.path);
  assertCron(changes.scanCron);
  orThrow(
    context.db.query.libraries
      .findFirst({ columns: { id: true }, where: { id } })
      .sync(),
  );
  context.db.transaction((tx) => {
    if (hasChanges(changes)) {
      tx.update(libraries).set(changes).where(eq(libraries.id, id)).run();
    }
    if (integrations !== undefined) {
      setIntegrations(tx, id, integrations);
    }
    if (rules !== undefined) {
      setRules(tx, id, rules);
    }
  });
  if (rules !== undefined) {
    await reevaluateLibrary(context, id);
  }
  const updated = orThrow(
    context.db.query.libraries
      .findFirst({ ...libraryOptions, where: { id } })
      .sync(),
  ) as Library;
  context.schedulers.scan.update(updated);
  return updated;
});

const remove = orpc.libraries.remove.handler(({ context, input }) => {
  const removed = firstOrThrow(
    context.db
      .delete(libraries)
      .where(eq(libraries.id, input.id))
      .returning({ id: libraries.id })
      .all(),
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
