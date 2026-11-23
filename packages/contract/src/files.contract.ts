import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
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
});
export type MediaInfo = z.infer<typeof MediaInfoSchema>;

export const FileSchema = z.object({
  id: FileIdSchema,
  libraryId: LibraryIdSchema,
  path: z.string(),
  size: z.number().int().nonnegative(),
  mediaInfo: MediaInfoSchema.nullable(),
  status: FileStatusSchema,
  ignored: z.boolean(),
});
export type File = z.infer<typeof FileSchema>;

const tags = ["files"];

export const filesContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/files", tags })
    .input(
      PaginationSchema.extend({
        libraryId: LibraryIdSchema.optional(),
        status: FileStatusSchema.optional(),
        search: z.string().optional(),
      }),
    )
    .output(pageOf(FileSchema)),
  get: orpc
    .route({ method: "GET", path: "/files/{id}", tags })
    .input(z.object({ id: FileIdSchema }))
    .output(FileSchema),
  update: orpc
    .route({ method: "PATCH", path: "/files/{id}", tags })
    .input(z.object({ id: FileIdSchema, ignored: z.boolean() }))
    .output(FileSchema),
});
