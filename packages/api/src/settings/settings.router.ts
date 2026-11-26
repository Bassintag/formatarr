import { userAuth } from "@/auth/auth.middleware";
import { orpc } from "@/lib/orpc";

const userSettings = orpc.settings.use(userAuth);

const get = userSettings.get.handler(({ context }) => {
  return context.settings.read();
});

const update = userSettings.update.handler(({ context, input }) => {
  return context.settings.update(input);
});

export const settingsRouter = orpc.settings.router({
  get,
  update,
});
