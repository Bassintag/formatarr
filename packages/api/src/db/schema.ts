import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
});
