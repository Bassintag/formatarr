import type { RuleId } from "@formatarr/contract";
import { count, eq, sql } from "drizzle-orm";
import { rules } from "@/db/schema";
import { firstOrThrow, orThrow, paginationOption, toPage } from "@/lib/db";
import { orpc } from "@/lib/orpc";
import { assertLibraryExists } from "./rule.lib";
import { ruleOptions } from "./rule.options";

const list = orpc.rules.list.handler(async ({ context, input }) => {
  function where(table: typeof rules) {
    if (input.libraryId == null) return sql`true`;
    return eq(table.libraryId, input.libraryId);
  }

  return toPage(
    context.db.query.rules.findMany({
      ...ruleOptions,
      where: { RAW: where },
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(rules).where(where(rules)),
  );
});

const create = orpc.rules.create.handler(async ({ context, input }) => {
  const id = context.db.transaction((tx) => {
    assertLibraryExists(tx, input.libraryId);
    const { lastInsertRowid } = tx.insert(rules).values(input).run();
    return Number(lastInsertRowid) as RuleId;
  });
  return orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }),
  );
});

const get = orpc.rules.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.rules.findFirst({
      ...ruleOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.rules.update.handler(async ({ context, input }) => {
  const { id, ...changes } = input;
  await orThrow(
    context.db.query.rules.findFirst({ columns: { id: true }, where: { id } }),
  );
  if (Object.values(changes).some((value) => value !== undefined)) {
    context.db.update(rules).set(changes).where(eq(rules.id, id)).run();
  }
  return orThrow(
    context.db.query.rules.findFirst({ ...ruleOptions, where: { id } }),
  );
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
  update,
  remove,
});
