import type { QueryOptions } from "@/lib/db";

export const fileOptions = {
  columns: {
    id: true,
    libraryId: true,
    path: true,
    size: true,
    mediaInfo: true,
    status: true,
    ignored: true,
  },
} satisfies QueryOptions<"files">;
