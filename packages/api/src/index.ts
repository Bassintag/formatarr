import { createFetchHandler } from "@/app";
import { createContext } from "@/context";

const context = await createContext();

const server = Bun.serve({
  port: context.env.API_PORT,
  idleTimeout: 0,
  maxRequestBodySize: Number.MAX_SAFE_INTEGER,
  fetch: createFetchHandler(context),
});

context.logger.info(`api listening on ${server.url}`);
