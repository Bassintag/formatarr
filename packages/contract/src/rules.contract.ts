import { z } from "zod";
import { PaginationSchema, pageOf } from "./common.contract";
import { LibraryIdSchema, RuleIdSchema } from "./ids";
import { orpc } from "./orpc";

export const ConditionFieldSchema = z.enum([
  "container",
  "videoCodec",
  "width",
  "height",
  "bitrate",
  "audioCodec",
  "audioLanguages",
  "size",
]);

export const ConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "lt",
  "in",
  "notIn",
]);

const scalar = z.union([z.string(), z.number()]);

export const ConditionSchema = z.object({
  field: ConditionFieldSchema,
  operator: ConditionOperatorSchema,
  value: z.union([scalar, z.array(scalar)]),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transcodeVideo"),
    codec: z.enum(["h264", "hevc", "av1"]),
    crf: z.number().int().min(0).max(63),
  }),
  z.object({
    type: z.literal("transcodeAudio"),
    codec: z.enum(["aac", "ac3", "eac3", "opus"]),
    bitrate: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("removeStreams"),
    kind: z.enum(["audio", "subtitle"]),
    keepLanguages: z.array(z.string()),
  }),
  z.object({
    type: z.literal("setContainer"),
    container: z.enum(["mkv", "mp4"]),
  }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const RuleSchema = z.object({
  id: RuleIdSchema,
  libraryId: LibraryIdSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  position: z.number().int().nonnegative(),
  conditions: z.array(ConditionSchema),
  actions: z.array(ActionSchema).min(1),
});
export type Rule = z.infer<typeof RuleSchema>;

const RuleInputSchema = RuleSchema.omit({ id: true });
const tags = ["rules"];

export const rulesContract = orpc.router({
  list: orpc
    .route({ method: "GET", path: "/rules", tags })
    .input(PaginationSchema.extend({ libraryId: LibraryIdSchema.optional() }))
    .output(pageOf(RuleSchema)),
  create: orpc
    .route({ method: "POST", path: "/rules", tags })
    .input(RuleInputSchema)
    .output(RuleSchema),
  get: orpc
    .route({ method: "GET", path: "/rules/{id}", tags })
    .input(z.object({ id: RuleIdSchema }))
    .output(RuleSchema),
  update: orpc
    .route({ method: "PATCH", path: "/rules/{id}", tags })
    .input(
      RuleInputSchema.omit({ libraryId: true })
        .partial()
        .extend({ id: RuleIdSchema }),
    )
    .output(RuleSchema),
  remove: orpc
    .route({ method: "DELETE", path: "/rules/{id}", tags })
    .input(z.object({ id: RuleIdSchema }))
    .output(z.void()),
});
