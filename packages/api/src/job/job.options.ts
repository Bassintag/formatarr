import type { QueryOptions } from "@/lib/db";

export const jobOptions = {
  columns: {
    id: true,
    fileId: true,
    ruleId: true,
    workerId: true,
    status: true,
    progress: true,
    error: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
  },
} satisfies QueryOptions<"jobs">;
