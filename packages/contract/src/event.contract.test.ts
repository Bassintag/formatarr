import { expect, test } from "bun:test";
import { AppEventSchema } from "./event.contract";

test("AppEventSchema parses every resource", () => {
  for (const resource of ["job", "file", "worker"]) {
    const event = { resource, change: "updated", id: 1 };
    expect(AppEventSchema.safeParse(event).success).toBe(true);
  }
});

test("AppEventSchema rejects an unknown resource", () => {
  const event = { resource: "library", change: "updated", id: 1 };
  expect(AppEventSchema.safeParse(event).success).toBe(false);
});
