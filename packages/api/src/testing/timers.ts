import { jest } from "bun:test";

export async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
