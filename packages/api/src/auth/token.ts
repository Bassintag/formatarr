import { jwtVerify, SignJWT } from "jose";

type TokenType = "access" | "refresh";

const LIFETIMES: Record<TokenType, string> = {
  access: "15m",
  refresh: "30d",
};

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

function signToken(type: TokenType, username: string, secret: string) {
  return new SignJWT({ typ: type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(LIFETIMES[type])
    .sign(key(secret));
}

export async function issueTokens(username: string, secret: string) {
  const [accessToken, refreshToken] = await Promise.all([
    signToken("access", username, secret),
    signToken("refresh", username, secret),
  ]);
  return { accessToken, refreshToken };
}

export async function verifyToken(
  type: TokenType,
  token: string,
  secret: string,
) {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
    });
    if (payload.typ !== type || !payload.sub) return null;
    return { username: payload.sub };
  } catch {
    return null;
  }
}
