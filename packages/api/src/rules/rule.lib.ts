import type { LibraryId } from "@formatarr/contract";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { libraries } from "@/db/schema";
import type { Tx } from "@/lib/db";

export function assertLibraryExists(tx: Tx, libraryId: LibraryId) {
  const found = tx
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, libraryId))
    .get();
  if (!found) {
    throw new ORPCError("BAD_REQUEST", { message: "Unknown library id" });
  }
}
