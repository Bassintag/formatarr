import "@orpc/openapi/extensions/route";
import { defineMeta, oc } from "@orpc/contract";

export interface AuthMeta {
  kind: "user" | "worker" | null;
}

export const [authMeta, getAuthMeta] = defineMeta(
  "auth",
  (incoming: AuthMeta, current) => ({ ...current, ...incoming }),
);

export const publicMeta = authMeta({ kind: null });
export const workerMeta = authMeta({ kind: "worker" });

export const orpc = oc.meta(authMeta({ kind: "user" }));
