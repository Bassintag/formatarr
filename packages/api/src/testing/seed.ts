import type { LibraryId } from "@formatarr/contract";
import type { Context } from "@/context";
import { files, libraries, rules, workers } from "@/db/schema";

type Db = Context["db"];
type LibraryValues = Partial<typeof libraries.$inferInsert>;
type FileValues = Partial<typeof files.$inferInsert>;
type RuleValues = Partial<typeof rules.$inferInsert>;
type WorkerValues = Partial<typeof workers.$inferInsert>;

export const unknownId = 999 as never;

let sequence = 0;

export function seedLibrary(db: Db, values: LibraryValues = {}) {
  return db
    .insert(libraries)
    .values({ name: "lib", path: "/tmp", ...values })
    .returning()
    .get();
}

export function seedFile(
  db: Db,
  libraryId: LibraryId,
  values: FileValues = {},
) {
  sequence += 1;
  return db
    .insert(files)
    .values({
      libraryId,
      path: `/tmp/file-${sequence}.mkv`,
      size: 1,
      ...values,
    })
    .returning()
    .get();
}

export function seedRule(
  db: Db,
  libraryId: LibraryId,
  values: RuleValues = {},
) {
  return db
    .insert(rules)
    .values({
      libraryId,
      name: "r",
      conditions: [],
      actions: [{ type: "setContainer", container: "mkv" }],
      ...values,
    })
    .returning()
    .get();
}

export function seedWorker(db: Db, values: WorkerValues = {}) {
  return db
    .insert(workers)
    .values({
      name: "w",
      tokenHash: "h",
      capabilities: { ffmpegVersion: "7.0", hwaccels: [] },
      ...values,
    })
    .returning()
    .get();
}
