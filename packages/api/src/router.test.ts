import { expect, test } from "bun:test";
import { getAuthMeta } from "@formatarr/contract";
import { type AnyMiddleware, type AnyProcedure, Procedure } from "@orpc/server";
import { userAuth, workerAuth } from "@/auth/auth.middleware";
import { router } from "@/router";

const expected: Record<"user" | "worker", AnyMiddleware> = {
  user: userAuth,
  worker: workerAuth,
};
const authMiddlewares = Object.values(expected);

function listProcedures(
  node: object,
  path: string[] = [],
): [string, AnyProcedure][] {
  if (node instanceof Procedure) return [[path.join("."), node]];
  return Object.entries(node).flatMap(([key, child]) =>
    listProcedures(child, [...path, key]),
  );
}

test.each(listProcedures(router))(
  "%s runs the auth middleware its contract declares",
  (_, procedure) => {
    const kind = getAuthMeta(procedure)?.kind;
    const applied = procedure["~orpc"].orderedMiddlewares
      .map(({ middleware }) => middleware)
      .filter((middleware) => authMiddlewares.includes(middleware));

    expect(applied).toEqual(kind ? [expected[kind]] : []);
  },
);
