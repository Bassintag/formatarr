import { z } from "zod";

const id = <B extends string>() =>
  z.coerce.number().int().positive().brand<B>();

export const LibraryIdSchema = id<"LibraryId">();
export type LibraryId = z.infer<typeof LibraryIdSchema>;

export const RuleIdSchema = id<"RuleId">();
export type RuleId = z.infer<typeof RuleIdSchema>;

export const FileIdSchema = id<"FileId">();
export type FileId = z.infer<typeof FileIdSchema>;

export const JobIdSchema = id<"JobId">();
export type JobId = z.infer<typeof JobIdSchema>;

export const WorkerIdSchema = id<"WorkerId">();
export type WorkerId = z.infer<typeof WorkerIdSchema>;

export const IntegrationIdSchema = id<"IntegrationId">();
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;
