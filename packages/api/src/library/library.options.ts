import type { QueryOptions } from "@/lib/db";
import { ruleOptions } from "@/rules/rule.options";

export const libraryOptions = {
  columns: {
    id: true,
    name: true,
    path: true,
    enabled: true,
    scanCron: true,
    watch: true,
  },
  with: {
    integrations: {
      columns: { id: true },
    },
    rules: {
      ...ruleOptions,
      orderBy: { id: "asc" },
    },
  },
} satisfies QueryOptions<"libraries">;
