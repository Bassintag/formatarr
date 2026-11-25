import { randomBytes } from "node:crypto";

const TOKEN_PREFIX = "fmw_";

export function generateWorkerToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashWorkerToken(token: string) {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}
