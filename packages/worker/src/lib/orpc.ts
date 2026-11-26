import { type ApiClient, contract } from "@formatarr/contract";
import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi/fetch";
import { env } from "./env";

export const client: ApiClient = createORPCClient(
  new OpenAPILink(contract, {
    origin: env.API_URL,
    url: "/",
    headers() {
      return { authorization: `Bearer ${env.WORKER_TOKEN}` };
    },
  }),
);
