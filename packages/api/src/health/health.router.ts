import { orpc } from "@/lib/orpc";

const check = orpc.health.check.handler(() => {
  return { status: "ok", time: new Date() };
});

export const healthRouter = orpc.health.router({ check });
