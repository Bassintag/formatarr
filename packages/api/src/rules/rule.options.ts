import type { QueryOptions } from "@/lib/db";

export const ruleOptions = {
  columns: {
    id: true,
    libraryId: true,
    enabled: true,
    type: true,
    value: true,
  },
} satisfies QueryOptions<"rules">;
