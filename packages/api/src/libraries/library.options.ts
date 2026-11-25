import type { QueryOptions } from "@/lib/db";

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
  },
} satisfies QueryOptions<"libraries">;
