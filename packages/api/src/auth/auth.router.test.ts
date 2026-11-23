import { expect, test } from "bun:test";
import { createTestCaller } from "@/testing/harness";

const credentials = { username: "admin", password: "hunter2" };

function bearer(token: string) {
  return new Request("http://localhost", {
    headers: { authorization: `Bearer ${token}` },
  });
}

test("protected procedures reject anonymous callers", async () => {
  const { call } = createTestCaller({}, { authenticated: false });
  expect(call.settings.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("public procedures stay open", async () => {
  const { call } = createTestCaller({}, { authenticated: false });
  expect((await call.health.check()).status).toBe("ok");
});

test("api key authenticates", async () => {
  const { call } = createTestCaller();
  expect((await call.settings.get()).auth.apiKey).toBeTruthy();
});

test("wrong api key is rejected", async () => {
  const { call } = createTestCaller({
    request: new Request("http://localhost", {
      headers: { "x-api-key": "nope" },
    }),
  });
  expect(call.settings.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("setup creates credentials once and returns usable tokens", async () => {
  const { call, context } = createTestCaller({}, { authenticated: false });
  const tokens = await call.auth.setup(credentials);
  expect((await context.settings.read()).auth.username).toBe("admin");

  expect(call.auth.setup(credentials)).rejects.toMatchObject({
    code: "CONFLICT",
  });

  const authed = createTestCaller({
    ...context,
    request: bearer(tokens.accessToken),
  });
  expect((await authed.call.settings.get()).auth.username).toBe("admin");
});

test("login checks username and password", async () => {
  const { call } = createTestCaller({}, { authenticated: false });
  await call.auth.setup(credentials);

  expect((await call.auth.login(credentials)).accessToken).toBeTruthy();
  expect(
    call.auth.login({ ...credentials, password: "wrong" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(
    call.auth.login({ ...credentials, username: "other" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("login is refused before setup", async () => {
  const { call } = createTestCaller({}, { authenticated: false });
  expect(
    call.auth.login({ username: "admin", password: "x" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("refresh accepts refresh tokens only", async () => {
  const { call } = createTestCaller({}, { authenticated: false });
  const tokens = await call.auth.setup(credentials);

  expect(
    (await call.auth.refresh({ refreshToken: tokens.refreshToken }))
      .accessToken,
  ).toBeTruthy();
  expect(
    call.auth.refresh({ refreshToken: tokens.accessToken }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("access token is not accepted as refresh and vice versa", async () => {
  const { call, context } = createTestCaller({}, { authenticated: false });
  const tokens = await call.auth.setup(credentials);

  const authed = createTestCaller({
    ...context,
    request: bearer(tokens.refreshToken),
  });
  expect(authed.call.settings.get()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
