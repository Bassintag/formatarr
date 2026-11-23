import { orpc } from "@/lib/orpc";

const get = orpc.settings.get.handler(({ context }) => {
  return context.settings.read();
});

const update = orpc.settings.update.handler(({ context, input }) => {
  return context.settings.update(input);
});

export const settingsRouter = orpc.settings.router({
  get,
  update,
});
