import { z } from "zod";
import { orpc } from "./orpc";

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const TokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type Tokens = z.infer<typeof TokensSchema>;

export const authContract = orpc.router({
  login: orpc
    .route({ method: "POST", path: "/auth/login", tags: ["auth"] })
    .input(LoginSchema)
    .output(TokensSchema),
  refresh: orpc
    .route({ method: "POST", path: "/auth/refresh", tags: ["auth"] })
    .input(z.object({ refreshToken: z.string() }))
    .output(TokensSchema),
});
