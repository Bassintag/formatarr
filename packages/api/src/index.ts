import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { PinoHandlerPlugin } from "@orpc/pino";
import { createContext } from "@/context";
import { router } from "@/router";

const context = await createContext();

const handler = new OpenAPIHandler(router, {
  plugins: [new PinoHandlerPlugin({ logger: context.logger })],
});

const server = Bun.serve({
  port: context.env.API_PORT,
  idleTimeout: 0,
  async fetch(request) {
    const { matched, response } = await handler.handle(request, {
      context: { ...context, request },
    });
    if (!matched) return new Response("Not found", { status: 404 });
    return response;
  },
});

context.logger.info(`api listening on ${server.url}`);
