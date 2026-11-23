import { timingSafeEqual } from "node:crypto";
import { getAuthMeta } from "@formatarr/contract";
import { ORPCError, os } from "@orpc/server";
import { verifyToken } from "@/auth/tokens";
import type { RequestContext } from "@/context";

export type AuthUser = { username: string };

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const authMiddleware = os
  .$context<RequestContext>()
  .middleware(async ({ context, procedure, next }) => {
    if (!getAuthMeta(procedure)?.required) return next();

    const auth = (await context.settings.read()).auth;
    const headers = context.request.headers;

    const apiKey = headers.get("x-api-key");
    if (apiKey && safeEqual(apiKey, auth.apiKey)) {
      return next({ context: { user: { username: "api-key" } as AuthUser } });
    }

    const bearer = headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (bearer) {
      const user = await verifyToken("access", bearer, auth.jwtSecret);
      if (user) return next({ context: { user: user as AuthUser } });
    }

    throw new ORPCError("UNAUTHORIZED");
  });
