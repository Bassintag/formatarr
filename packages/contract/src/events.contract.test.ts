import { expect, test } from "bun:test";
import { EventSchema } from "./events.contract";

test("EventSchema parses every resource", () => {
  for (const resource of ["job", "file", "worker"]) {
    const event = { resource, change: "updated", id: 1 };
    expect(EventSchema.safeParse(event).success).toBe(true);
  }
});

test("EventSchema rejects an unknown resource", () => {
  const event = { resource: "library", change: "updated", id: 1 };
  expect(EventSchema.safeParse(event).success).toBe(false);
});
