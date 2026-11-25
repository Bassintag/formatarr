import { describe, expect, mock, test } from "bun:test";
import { createTestCaller, noopScanScheduler } from "@/testing/harness";
import { seedLibrary, unknownId } from "@/testing/seed";

describe("scans.create", () => {
  test("delegates to the scan scheduler", async () => {
    const scan = mock(async () => {});
    const { call, db } = createTestCaller({
      schedulers: { scan: { ...noopScanScheduler, scan } },
    });
    const library = seedLibrary(db, { path: "/media" });

    await call.scans.create({ libraryId: library.id });

    expect(scan).toHaveBeenCalledWith(library.id);
  });

  test("rejects unknown libraries", async () => {
    const scan = mock(async () => {});
    const { call } = createTestCaller({
      schedulers: { scan: { ...noopScanScheduler, scan } },
    });

    expect(call.scans.create({ libraryId: unknownId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(scan).not.toHaveBeenCalled();
  });
});
