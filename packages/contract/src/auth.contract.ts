import { z } from "zod";
import { orpc, publicMeta } from "./orpc";

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SetupInputSchema = LoginInputSchema;
export type SetupInput = z.infer<typeof SetupInputSchema>;

export const RefreshInputSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshInput = z.infer<typeof RefreshInputSchema>;

export const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type Tokens = z.infer<typeof TokensSchema>;

export const authContract = orpc
  .route({ prefix: "/auth", tags: ["auth"] })
  .router({
    setup: orpc
      .meta(publicMeta)
      .route({ method: "POST", path: "/setup" })
      .input(SetupInputSchema)
      .output(TokensSchema),
    login: orpc
      .meta(publicMeta)
      .route({ method: "POST", path: "/login" })
      .input(LoginInputSchema)
      .output(TokensSchema),
    refresh: orpc
      .meta(publicMeta)
      .route({ method: "POST", path: "/refresh" })
      .input(RefreshInputSchema)
      .output(TokensSchema),
  });
