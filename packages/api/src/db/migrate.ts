import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createDb } from "@/lib/db";
import { createEnv } from "@/lib/env";

migrate(createDb(createEnv().DATABASE_URL), {
  migrationsFolder: `${import.meta.dir}/../../drizzle`,
});

console.log("migrations applied");
