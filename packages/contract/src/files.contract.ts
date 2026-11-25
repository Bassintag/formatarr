import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
} from "./common.contract";
import { FileIdSchema, LibraryIdSchema } from "./ids";
import { orpc } from "./orpc";

export const FileStatusSchema = z.enum([
  "pending",
  "queued",
  "processing",
  "done",
  "failed",
]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const MediaInfoSchema = z.object({
  container: z.string(),
  durationSeconds: z.number(),
  bitrate: z.number(),
  video: z.object({
    codec: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  audio: z.array(
    z.object({
      codec: z.string(),
      language: z.string().nullable(),
      channels: z.number(),
    }),
  ),
  subtitles: z.array(
    z.object({ codec: z.string(), language: z.string().nullable() }),
  ),
});
export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export const FileSchema = z.object({
  id: FileIdSchema,
  libraryId: LibraryIdSchema,
  path: z.string(),
  size: z.number(),
  mediaInfo: MediaInfoSchema.nullable(),
  status: FileStatusSchema,
  ignored: z.boolean(),
});
export type File = z.infer<typeof FileSchema>;

export const ListFilesInputSchema = PaginationSchema.extend({
  libraryId: LibraryIdSchema.optional(),
  status: FileStatusSchema.optional(),
  search: z.string().optional(),
});
export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;

export const FileUpdateSchema = z.object({
  id: FileIdSchema,
  ignored: z.boolean(),
});
export type FileUpdate = z.infer<typeof FileUpdateSchema>;

export const filesContract = orpc
  .route({ prefix: "/files", tags: ["files"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(ListFilesInputSchema)
      .output(PageSchema(FileSchema)),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(FileIdSchema))
      .output(FileSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(FileUpdateSchema)
      .output(FileSchema),
  });
