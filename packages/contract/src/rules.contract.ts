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

export const ListRulesInputSchema = PaginationSchema.extend({
  libraryId: LibraryIdSchema.optional(),
});
export type ListRulesInput = z.infer<typeof ListRulesInputSchema>;

export const CreateRuleInputSchema = RuleSchema.omit({ id: true });
export type CreateRuleInput = z.infer<typeof CreateRuleInputSchema>;

export const UpdateRuleInputSchema = UpdateSchema(
  CreateRuleInputSchema.omit({ libraryId: true }),
  RuleIdSchema,
);
export type UpdateRuleInput = z.infer<typeof UpdateRuleInputSchema>;

export const rulesContract = orpc
  .route({ prefix: "/rules", tags: ["rules"] })
  .router({
    list: orpc
      .route({ method: "GET", path: "/" })
      .input(ListRulesInputSchema)
      .output(PageSchema(RuleSchema)),
    create: orpc
      .route({ method: "POST", path: "/" })
      .input(CreateRuleInputSchema)
      .output(RuleSchema),
    get: orpc
      .route({ method: "GET", path: "/{id}" })
      .input(IdParamsSchema(RuleIdSchema))
      .output(RuleSchema),
    update: orpc
      .route({ method: "PATCH", path: "/{id}" })
      .input(UpdateRuleInputSchema)
      .output(RuleSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(RuleIdSchema))
      .output(VoidSchema),
  });
