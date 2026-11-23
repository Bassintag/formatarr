import { expect, test } from "bun:test";
import { contract, getAuthMeta } from "./index";

test("auth is required by default", () => {
  expect(getAuthMeta(contract.settings.get)?.required).toBe(true);
  expect(getAuthMeta(contract.workers.list)?.required).toBe(true);
});

test("health and auth entry points are public", () => {
  expect(getAuthMeta(contract.health.check)?.required).toBe(false);
  expect(getAuthMeta(contract.auth.setup)?.required).toBe(false);
  expect(getAuthMeta(contract.auth.login)?.required).toBe(false);
  expect(getAuthMeta(contract.auth.refresh)?.required).toBe(false);
});
