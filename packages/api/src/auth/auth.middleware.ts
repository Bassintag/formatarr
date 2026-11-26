import { timingSafeEqual } from "node:crypto";
import type { WorkerId } from "@formatarr/contract";
import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { verifyToken } from "@/auth/token";
import type { RequestContext } from "@/context";
import { workers } from "@/db/schema";
import { hashWorkerToken } from "@/worker/worker.lib";

type AuthUser = { username: string };
export type AuthWorker = { id: WorkerId };

const base = os.$context<RequestContext>();

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearerToken(headers: Headers) {
  return headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
}

export const userAuth = base.middleware(async ({ context, next }) => {
  const { headers } = context.request;
  const auth = (await context.settings.read()).auth;

  const apiKey = headers.get("x-api-key");
  if (apiKey && safeEqual(apiKey, auth.apiKey)) {
    const user: AuthUser = { username: "api-key" };
    return next({ context: { user } });
  }

  const bearer = bearerToken(headers);
  if (bearer) {
    const user = await verifyToken("access", bearer, auth.jwtSecret);
    if (user) return next({ context: { user } });
  }

  throw new ORPCError("UNAUTHORIZED");
});

export const workerAuth = base.middleware(({ context, next }) => {
  const bearer = bearerToken(context.request.headers);
  if (bearer) {
    const row = context.db
      .select({ id: workers.id, enabled: workers.enabled })
      .from(workers)
      .where(eq(workers.tokenHash, hashWorkerToken(bearer)))
      .get();
    if (row?.enabled) {
      const worker: AuthWorker = { id: row.id };
      return next({ context: { worker } });
    }
  }

  throw new ORPCError("UNAUTHORIZED");
});
