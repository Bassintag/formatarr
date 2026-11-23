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

export const FileSchema = z.object({
  id: FileIdSchema,
  libraryId: LibraryIdSchema,
  path: z.string(),
  size: z.number().int().nonnegative(),
  mediaInfo: z
    .object({
      container: z.string(),
      durationSeconds: z.number().nonnegative(),
      bitrate: z.number().nonnegative(),
      video: z.object({
        codec: z.string(),
        width: z.number().int(),
        height: z.number().int(),
      }),
      audio: z.array(
        z.object({
          codec: z.string(),
          language: z.string().nullable(),
          channels: z.number().int(),
        }),
      ),
      subtitles: z.array(
        z.object({ codec: z.string(), language: z.string().nullable() }),
      ),
    })
    .nullable(),
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

export const UpdateFileInputSchema = z.object({
  id: FileIdSchema,
  ignored: z.boolean(),
});
export type UpdateFileInput = z.infer<typeof UpdateFileInputSchema>;

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
      .input(UpdateFileInputSchema)
      .output(FileSchema),
  });
