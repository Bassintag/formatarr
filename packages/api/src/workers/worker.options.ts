import type { QueryOptions } from "@/lib/db";

// TODO: make this a per-worker column
const MAX_RUNNING_JOBS = 1;

export const workerOptions = {
  columns: {
    id: true,
    name: true,
    status: true,
    enabled: true,
    capabilities: true,
    pathMappings: true,
    lastSeenAt: true,
  },
  with: {
    runningJobs: {
      columns: { id: true },
      limit: MAX_RUNNING_JOBS,
    },
  },
} satisfies QueryOptions<"workers">;
