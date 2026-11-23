import { defineRelations } from "drizzle-orm";
import * as schema from "@/db/schema";

export const relations = defineRelations(schema, (r) => ({
  libraries: {
    files: r.many.files(),
    rules: r.many.rules(),
    integrations: r.many.integrations({
      from: r.libraries.id.through(r.libraryIntegrations.libraryId),
      to: r.integrations.id.through(r.libraryIntegrations.integrationId),
    }),
  },
  integrations: {
    libraries: r.many.libraries(),
  },
  rules: {
    library: r.one.libraries({
      from: r.rules.libraryId,
      to: r.libraries.id,
    }),
    jobs: r.many.jobs(),
  },
  files: {
    library: r.one.libraries({
      from: r.files.libraryId,
      to: r.libraries.id,
    }),
    jobs: r.many.jobs(),
  },
  workers: {
    jobs: r.many.jobs(),
    runningJobs: r.many.jobs({
      from: r.workers.id,
      to: r.jobs.workerId,
      where: { status: "running" },
    }),
  },
  jobs: {
    file: r.one.files({
      from: r.jobs.fileId,
      to: r.files.id,
    }),
    rule: r.one.rules({
      from: r.jobs.ruleId,
      to: r.rules.id,
    }),
    worker: r.one.workers({
      from: r.jobs.workerId,
      to: r.workers.id,
    }),
  },
}));
