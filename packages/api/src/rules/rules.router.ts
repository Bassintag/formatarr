import type { Rule } from "@formatarr/contract";
import { count, eq } from "drizzle-orm";
import { rules } from "@/db/schema";
import {
  buildWhere,
  firstOrThrow,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { assertLibraryExists, reevaluateLibrary } from "@/rules/rule.lib";
import { ruleOptions } from "@/rules/rule.options";

const list = orpc.rules.list.handler(({ context, input }) => {
  function where(table: typeof rules) {
    return buildWhere([
      input.libraryId == null
        ? undefined
        : eq(table.libraryId, input.libraryId),
    ]);
  }

  const page = toPage(
    context.db.query.rules
      .findMany({
        ...ruleOptions,
        where: { RAW: where },
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(rules).where(where(rules)).all(),
  );
  return { ...page, items: page.items as Rule[] };
});

const create = orpc.rules.create.handler(async ({ context, input }) => {
  const { id } = context.db.transaction((tx) => {
    assertLibraryExists(tx, input.libraryId);
    return tx.insert(rules).values(input).returning({ id: rules.id }).get();
  });
  await reevaluateLibrary(context, input.libraryId);
  return orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }).sync(),
  ) as Rule;
});

const get = orpc.rules.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.rules
      .findFirst({
        ...ruleOptions,
        where: { id: input.id },
      })
      .sync(),
  ) as Rule;
});

const set = orpc.rules.set.handler(async ({ context, input }) => {
  const { id, ...values } = input;
  const { libraryId } = firstOrThrow(
    context.db
      .update(rules)
      .set(values)
      .where(eq(rules.id, id))
      .returning({ libraryId: rules.libraryId })
      .all(),
  );
  await reevaluateLibrary(context, libraryId);
  return orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }).sync(),
  ) as Rule;
});

const remove = orpc.rules.remove.handler(async ({ context, input }) => {
  const { libraryId } = firstOrThrow(
    context.db
      .delete(rules)
      .where(eq(rules.id, input.id))
      .returning({ libraryId: rules.libraryId })
      .all(),
  );
  await reevaluateLibrary(context, libraryId);
});

export const rulesRouter = orpc.rules.router({
  list,
  create,
  get,
  set,
  remove,
});
