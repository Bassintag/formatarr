import { afterEach, beforeEach, jest, mock } from "bun:test";

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
});

afterEach(() => {
  jest.useRealTimers();
  mock.restore();
});
