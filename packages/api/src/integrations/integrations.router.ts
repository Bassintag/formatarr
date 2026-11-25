import { count, eq } from "drizzle-orm";
import { integrations } from "@/db/schema";
import { integrationOptions } from "@/integrations/integration.options";
import {
  firstOrThrow,
  hasChanges,
  orThrow,
  paginationOption,
  toPage,
} from "@/lib/db";
import { orpc } from "@/lib/orpc";

const list = orpc.integrations.list.handler(({ context, input }) =>
  toPage(
    context.db.query.integrations.findMany({
      ...integrationOptions,
      orderBy: { id: "asc" },
      ...paginationOption(input),
    }),
    context.db.select({ total: count() }).from(integrations),
  ),
);

const create = orpc.integrations.create.handler(({ context, input }) =>
  firstOrThrow(context.db.insert(integrations).values(input).returning()),
);

const get = orpc.integrations.get.handler(({ context, input }) =>
  orThrow(
    context.db.query.integrations.findFirst({
      ...integrationOptions,
      where: { id: input.id },
    }),
  ),
);

const update = orpc.integrations.update.handler(async ({ context, input }) => {
  const { id, ...changes } = input;
  if (hasChanges(changes)) {
    await firstOrThrow(
      context.db
        .update(integrations)
        .set(changes)
        .where(eq(integrations.id, id))
        .returning({ id: integrations.id }),
    );
  }
  return orThrow(
    context.db.query.integrations.findFirst({
      ...integrationOptions,
      where: { id },
    }),
  );
});

const remove = orpc.integrations.remove.handler(async ({ context, input }) => {
  await firstOrThrow(
    context.db
      .delete(integrations)
      .where(eq(integrations.id, input.id))
      .returning({ id: integrations.id }),
  );
});

export const integrationsRouter = orpc.integrations.router({
  list,
  create,
  get,
  update,
  remove,
});
