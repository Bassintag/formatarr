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
import { assertLibraryExists } from "@/rules/rule.lib";
import { ruleOptions } from "@/rules/rule.options";

const list = orpc.rules.list.handler(async ({ context, input }) => {
  function where(table: typeof rules) {
    return buildWhere([
      input.libraryId == null
        ? undefined
        : eq(table.libraryId, input.libraryId),
    ]);
  }

  const page = await toPage(
    context.db.query.rules.findMany({
      ...ruleOptions,
      where: { RAW: where },
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(rules).where(where(rules)),
  );
  return { ...page, items: page.items as Rule[] };
});

const create = orpc.rules.create.handler(async ({ context, input }) => {
  const { id } = context.db.transaction((tx) => {
    assertLibraryExists(tx, input.libraryId);
    return tx.insert(rules).values(input).returning({ id: rules.id }).get();
  });
  return (await orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }),
  )) as Rule;
});

const get = orpc.rules.get.handler(async ({ context, input }) => {
  return (await orThrow(
    context.db.query.rules.findFirst({
      ...ruleOptions,
      where: { id: input.id },
    }),
  )) as Rule;
});

const set = orpc.rules.set.handler(async ({ context, input }) => {
  const { id, ...values } = input;
  await firstOrThrow(
    context.db
      .update(rules)
      .set(values)
      .where(eq(rules.id, id))
      .returning({ id: rules.id }),
  );
  return (await orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }),
  )) as Rule;
});

const remove = orpc.rules.remove.handler(async ({ context, input }) => {
  await firstOrThrow(
    context.db
      .delete(rules)
      .where(eq(rules.id, input.id))
      .returning({ id: rules.id }),
  );
});

export const rulesRouter = orpc.rules.router({
  list,
  create,
  get,
  set,
  remove,
});
