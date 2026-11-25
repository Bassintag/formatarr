import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  UpdateSchema,
  VoidSchema,
} from "./common.contract";
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
export type ConditionField = z.infer<typeof ConditionFieldSchema>;

export const ConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "lt",
  "in",
  "notIn",
]);
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;

export const ScalarSchema = z.union([z.string(), z.number()]);
export type Scalar = z.infer<typeof ScalarSchema>;

export const ConditionSchema = z.object({
  field: ConditionFieldSchema,
  operator: ConditionOperatorSchema,
  value: z.union([ScalarSchema, z.array(ScalarSchema)]),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ConditionCreateSchema = ConditionSchema.refine(
  ({ operator, value }) => {
    if (operator === "in" || operator === "notIn") {
      return Array.isArray(value) && value.length > 0;
    }
    if (operator === "gt" || operator === "lt") {
      return typeof value === "number";
    }
    return !Array.isArray(value);
  },
  { message: "Value does not match the operator" },
);
export type ConditionCreate = z.infer<typeof ConditionCreateSchema>;

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transcodeVideo"),
    codec: z.enum(["h264", "hevc", "av1"]),
    crf: z.number(),
  }),
  z.object({
    type: z.literal("transcodeAudio"),
    codec: z.enum(["aac", "ac3", "eac3", "opus"]),
    bitrate: z.number(),
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

export const ActionCreateSchema = z.discriminatedUnion("type", [
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
export type ActionCreate = z.infer<typeof ActionCreateSchema>;

export const RuleSchema = z.object({
  id: RuleIdSchema,
  libraryId: LibraryIdSchema,
  name: z.string(),
  enabled: z.boolean(),
  conditions: z.array(ConditionSchema),
  actions: z.array(ActionSchema),
});
export type Rule = z.infer<typeof RuleSchema>;

export const ListRulesInputSchema = PaginationSchema.extend({
  libraryId: LibraryIdSchema.optional(),
});
export type ListRulesInput = z.infer<typeof ListRulesInputSchema>;

export const RuleCreateSchema = z.object({
  libraryId: LibraryIdSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  conditions: z.array(ConditionCreateSchema),
  actions: z.array(ActionCreateSchema).min(1),
});
export type RuleCreate = z.infer<typeof RuleCreateSchema>;

export const RuleUpdateSchema = UpdateSchema(
  RuleCreateSchema.omit({ libraryId: true }),
  RuleIdSchema,
);
export type RuleUpdate = z.infer<typeof RuleUpdateSchema>;

export const rulesContract = orpc
  .route({ prefix: "/rules", tags: ["rules"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(ListRulesInputSchema)
      .output(PageSchema(RuleSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(RuleCreateSchema)
      .output(RuleSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(RuleIdSchema))
      .output(RuleSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(RuleUpdateSchema)
      .output(RuleSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(RuleIdSchema))
      .output(VoidSchema),
  });
