import { healthRouter } from "./health/health.router";
import { orpc } from "./lib/orpc";

export const router = orpc.router({
  health: healthRouter,
});
