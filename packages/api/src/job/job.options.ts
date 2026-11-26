import type { QueryOptions } from "@/lib/db";
import { ruleOptions } from "@/rules/rule.options";

export const jobOptions = {
  columns: {
    id: true,
    fileId: true,
    workerId: true,
    status: true,
    progress: true,
    attempts: true,
    error: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
  },
  with: { rules: ruleOptions },
} satisfies QueryOptions<"jobs">;
