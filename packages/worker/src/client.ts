import { type ApiClient, contract } from "@formatarr/contract";
import { createORPCClient } from "@orpc/client";
import { OpenAPILink } from "@orpc/openapi/fetch";

export function createClient(origin: string): ApiClient {
  return createORPCClient(new OpenAPILink(contract, { origin, url: "/" }));
}
