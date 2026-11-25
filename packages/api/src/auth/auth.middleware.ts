import { timingSafeEqual } from "node:crypto";
import { getAuthMeta } from "@formatarr/contract";
import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { verifyToken } from "@/auth/token";
import type { RequestContext } from "@/context";
import { workers } from "@/db/schema";
import { hashWorkerToken } from "@/worker/worker.lib";

type AuthUser = { username: string };
type AuthWorker = { id: number };

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const authMiddleware = os
  .$context<RequestContext>()
  .middleware(async ({ context, procedure, next }) => {
    const kind = getAuthMeta(procedure)?.kind;
    if (!kind) return next();

    const headers = context.request.headers;
    const bearer = headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];

    if (kind === "worker") {
      if (bearer) {
        const [worker] = await context.db
          .select({ id: workers.id, enabled: workers.enabled })
          .from(workers)
          .where(eq(workers.tokenHash, hashWorkerToken(bearer)));
        if (worker?.enabled) {
          return next({ context: { worker: { id: worker.id } as AuthWorker } });
        }
      }
      throw new ORPCError("UNAUTHORIZED");
    }

    const auth = (await context.settings.read()).auth;

    const apiKey = headers.get("x-api-key");
    if (apiKey && safeEqual(apiKey, auth.apiKey)) {
      return next({ context: { user: { username: "api-key" } as AuthUser } });
    }

    if (bearer) {
      const user = await verifyToken("access", bearer, auth.jwtSecret);
      if (user) return next({ context: { user: user as AuthUser } });
    }

    throw new ORPCError("UNAUTHORIZED");
  });
