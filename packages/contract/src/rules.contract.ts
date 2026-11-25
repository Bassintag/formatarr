import { z } from "zod";
import {
  IdParamsSchema,
  PageSchema,
  PaginationSchema,
  VoidSchema,
} from "./common.contract";
import { LibraryIdSchema, RuleIdSchema } from "./ids";
import { orpc } from "./orpc";

const CodecValueSchema = z.string().min(1);
const PositiveIntSchema = z.number().int().positive();
const LanguagesSchema = z.array(z.string().min(1));

export const RuleTypeSchema = z.enum([
  "container",
  "videoCodec",
  "maxResolution",
  "maxBitrate",
  "audioCodec",
  "audioLanguages",
  "subtitleLanguages",
]);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const RuleValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("container"), value: CodecValueSchema }),
  z.object({ type: z.literal("videoCodec"), value: CodecValueSchema }),
  z.object({ type: z.literal("maxResolution"), value: PositiveIntSchema }),
  z.object({ type: z.literal("maxBitrate"), value: PositiveIntSchema }),
  z.object({ type: z.literal("audioCodec"), value: CodecValueSchema }),
  z.object({ type: z.literal("audioLanguages"), value: LanguagesSchema }),
  z.object({ type: z.literal("subtitleLanguages"), value: LanguagesSchema }),
]);
export type RuleValue = z.infer<typeof RuleValueSchema>;

export const RuleSchema = z.intersection(
  RuleValueSchema,
  z.object({
    id: RuleIdSchema,
    libraryId: LibraryIdSchema,
    enabled: z.boolean(),
  }),
);
export type Rule = z.infer<typeof RuleSchema>;

export const ListRulesInputSchema = PaginationSchema.extend({
  libraryId: LibraryIdSchema.optional(),
});
export type ListRulesInput = z.infer<typeof ListRulesInputSchema>;

export const RuleCreateSchema = z.intersection(
  RuleValueSchema,
  z.object({
    libraryId: LibraryIdSchema,
    enabled: z.boolean(),
  }),
);
export type RuleCreate = z.infer<typeof RuleCreateSchema>;

export const RuleSetSchema = z.intersection(
  RuleValueSchema,
  z.object({
    id: RuleIdSchema,
    enabled: z.boolean(),
  }),
);
export type RuleSet = z.infer<typeof RuleSetSchema>;

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
    set: orpc
      .route({ method: "PUT", path: "/{id}" })
      .input(RuleSetSchema)
      .output(RuleSchema),
    remove: orpc
      .route({ method: "DELETE", path: "/{id}" })
      .input(IdParamsSchema(RuleIdSchema))
      .output(VoidSchema),
  });
