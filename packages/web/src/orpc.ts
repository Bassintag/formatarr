import { type ApiClient, contract } from "@formatarr/contract";
import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

const client: ApiClient = createORPCClient(
  new OpenAPILink(contract, { origin: window.location.origin, url: "/api" }),
);

export const orpc = createTanstackQueryUtils(client);
