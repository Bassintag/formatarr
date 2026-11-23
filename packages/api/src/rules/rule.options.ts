import type { QueryOptions } from "@/lib/db";

export const ruleOptions = {
  columns: {
    id: true,
    libraryId: true,
    name: true,
    enabled: true,
    conditions: true,
    actions: true,
  },
} satisfies QueryOptions<"rules">;
