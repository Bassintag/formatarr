import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libraries } from "@/db/schema";
import { firstOrThrow } from "@/lib/db";
import { createTestCaller } from "@/testing/harness";

describe("scans.create", () => {
  test("delegates to the scan scheduler", async () => {
    const scan = mock(async () => {});
    const { call, db } = createTestCaller({
      schedulers: {
        scan: { scan, update: async () => {}, remove: () => {} },
      },
    });
    const library = await firstOrThrow(
      db
        .insert(libraries)
        .values({
          name: "lib",
          path: mkdtempSync(join(tmpdir(), "formatarr-scan-")),
        })
        .returning({ id: libraries.id }),
    );

    await call.scans.create({ libraryId: library.id });

    expect(scan).toHaveBeenCalledWith(library.id);
  });

  test("rejects unknown libraries", async () => {
    const scan = mock(async () => {});
    const { call } = createTestCaller({
      schedulers: {
        scan: { scan, update: async () => {}, remove: () => {} },
      },
    });

    expect(
      call.scans.create({ libraryId: 999 as never }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(scan).not.toHaveBeenCalled();
  });
});
