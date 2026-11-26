import { expect, test } from "bun:test";
import { AppEventSchema } from "./event.contract";

test("AppEventSchema parses every event type", () => {
  const events = [
    { type: "worker.connected", id: 1 },
    { type: "worker.disconnected", id: 1 },
    { type: "job.status", id: 1, status: "running" },
    { type: "job.progress", id: 1, progress: 50 },
  ];
  for (const event of events) {
    expect(AppEventSchema.safeParse(event).success).toBe(true);
  }
});

test("AppEventSchema rejects an unknown event type", () => {
  const event = { type: "file.updated", id: 1 };
  expect(AppEventSchema.safeParse(event).success).toBe(false);
});
