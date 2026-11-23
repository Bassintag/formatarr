import { z } from "zod";
import { orpc } from "./orpc";

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

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
    login: orpc
      .route({ method: "POST", path: "/login" })
      .input(LoginInputSchema)
      .output(TokensSchema),
    refresh: orpc
      .route({ method: "POST", path: "/refresh" })
      .input(RefreshInputSchema)
      .output(TokensSchema),
  });
