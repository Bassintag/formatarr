import { count, eq } from "drizzle-orm";
import { integrations } from "@/db/schema";
import { integrationOptions } from "@/integration/integration.options";
import {
  firstOrThrow,
  hasChanges,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";

const list = orpc.integrations.list.handler(({ context, input }) => {
  return toPage(
    context.db.query.integrations
      .findMany({
        ...integrationOptions,
        orderBy: { id: "asc" },
        ...paginationOption(input),
      })
      .sync(),
    context.db.select({ total: count() }).from(integrations).all(),
  );
});

const create = orpc.integrations.create.handler(({ context, input }) => {
  return firstOrThrow(
    context.db.insert(integrations).values(input).returning().all(),
  );
});

const get = orpc.integrations.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.integrations
      .findFirst({
        ...integrationOptions,
        where: { id: input.id },
      })
      .sync(),
  );
});

const update = orpc.integrations.update.handler(({ context, input }) => {
  const { id, ...changes } = input;
  if (hasChanges(changes)) {
    firstOrThrow(
      context.db
        .update(integrations)
        .set(changes)
        .where(eq(integrations.id, id))
        .returning({ id: integrations.id })
        .all(),
    );
  }
  return orThrow(
    context.db.query.integrations
      .findFirst({
        ...integrationOptions,
        where: { id },
      })
      .sync(),
  );
});

const remove = orpc.integrations.remove.handler(({ context, input }) => {
  firstOrThrow(
    context.db
      .delete(integrations)
      .where(eq(integrations.id, input.id))
      .returning({ id: integrations.id })
      .all(),
  );
});

export const integrationsRouter = orpc.integrations.router({
  list,
  create,
  get,
  update,
  remove,
});
