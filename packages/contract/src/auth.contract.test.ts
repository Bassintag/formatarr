import { expect, test } from "bun:test";
import { contract, getAuthMeta } from "./index";

test("auth is required by default", () => {
  expect(getAuthMeta(contract.settings.get)?.kind).toBe("user");
  expect(getAuthMeta(contract.workers.list)?.kind).toBe("user");
});

test("health and auth entry points are public", () => {
  expect(getAuthMeta(contract.health.check)?.kind).toBeNull();
  expect(getAuthMeta(contract.auth.setup)?.kind).toBeNull();
  expect(getAuthMeta(contract.auth.login)?.kind).toBeNull();
  expect(getAuthMeta(contract.auth.refresh)?.kind).toBeNull();
});

test("worker stream authenticates with a worker token", () => {
  expect(getAuthMeta(contract.workers.jobs)?.kind).toBe("worker");
});
