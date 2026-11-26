import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { PinoHandlerPlugin } from "@orpc/pino";
import { RequestLimitHandlerPlugin } from "@orpc/server/plugins";
import type { Context } from "@/context";
import { router } from "@/router";

const MAX_BODY_SIZE = 128 * 1024 * 1024;
const UPLOAD_PATH = /^\/jobs\/[^/]+\/result\/?$/;

export function createFetchHandler(
  context: Context,
  { maxBodySize = MAX_BODY_SIZE } = {},
) {
  const logger = new PinoHandlerPlugin({ logger: context.logger });
  const uploads = new OpenAPIHandler(router, { plugins: [logger] });
  const others = new OpenAPIHandler(router, {
    plugins: [logger, new RequestLimitHandlerPlugin({ maxBodySize })],
  });

  return async (request: Request) => {
    const isUpload = UPLOAD_PATH.test(new URL(request.url).pathname);
    const handler = isUpload ? uploads : others;
    const { matched, response } = await handler.handle(request, {
      context: { ...context, request },
    });
    if (!matched) return new Response("Not found", { status: 404 });
    return response;
  };
}
