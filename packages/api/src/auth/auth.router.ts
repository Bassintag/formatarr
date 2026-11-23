import { ORPCError } from "@orpc/server";
import { issueTokens, verifyToken } from "@/auth/tokens";
import { orpc } from "@/lib/orpc";

const setup = orpc.auth.setup.handler(async ({ context, input }) => {
  const { auth } = await context.settings.read();
  if (auth.username) throw new ORPCError("CONFLICT");

  const passwordHash = await Bun.password.hash(input.password);
  const updated = await context.settings.update({
    auth: { username: input.username, passwordHash },
  });
  return issueTokens(input.username, updated.auth.jwtSecret);
});

const login = orpc.auth.login.handler(async ({ context, input }) => {
  const { auth } = await context.settings.read();
  const valid =
    auth.username !== "" &&
    auth.passwordHash !== "" &&
    input.username === auth.username &&
    (await Bun.password.verify(input.password, auth.passwordHash));
  if (!valid) throw new ORPCError("UNAUTHORIZED");

  return issueTokens(auth.username, auth.jwtSecret);
});

const refresh = orpc.auth.refresh.handler(async ({ context, input }) => {
  const { auth } = await context.settings.read();
  const user = await verifyToken("refresh", input.refreshToken, auth.jwtSecret);
  if (!user || user.username !== auth.username) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return issueTokens(auth.username, auth.jwtSecret);
});

export const authRouter = orpc.auth.router({ setup, login, refresh });
