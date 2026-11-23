import "@orpc/openapi/extensions/route";
import { defineMeta, oc } from "@orpc/contract";

export interface AuthMeta {
  required: boolean;
}

export const [authMeta, getAuthMeta] = defineMeta(
  "auth",
  (incoming: AuthMeta, current) => ({ ...current, ...incoming }),
);

export const publicMeta = authMeta({ required: false });

export const orpc = oc.meta(authMeta({ required: true }));
