import { count, eq } from "drizzle-orm";
import { userAuth } from "@/auth/auth.middleware";
import { integrations } from "@/db/schema";
import { testConnection } from "@/integration/arr.lib";
import { integrationOptions } from "@/integration/integration.options";
import {
  firstOrThrow,
  hasChanges,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";

const userIntegrations = orpc.integrations.use(userAuth);

const list = userIntegrations.list.handler(({ context, input }) => {
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

const create = userIntegrations.create.handler(({ context, input }) => {
  return firstOrThrow(
    context.db.insert(integrations).values(input).returning().all(),
  );
});

const get = userIntegrations.get.handler(({ context, input }) => {
  return orThrow(
    context.db.query.integrations
      .findFirst({
        ...integrationOptions,
        where: { id: input.id },
      })
      .sync(),
  );
});

const update = userIntegrations.update.handler(({ context, input }) => {
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

const remove = userIntegrations.remove.handler(({ context, input }) => {
  firstOrThrow(
    context.db
      .delete(integrations)
      .where(eq(integrations.id, input.id))
      .returning({ id: integrations.id })
      .all(),
  );
});

const test = userIntegrations.test.handler(({ context, input }) => {
  return testConnection(
    orThrow(
      context.db.query.integrations
        .findFirst({
          ...integrationOptions,
          where: { id: input.id },
        })
        .sync(),
    ),
  );
});

export const integrationsRouter = orpc.integrations.router({
  list,
  create,
  get,
  update,
  remove,
  test,
});
