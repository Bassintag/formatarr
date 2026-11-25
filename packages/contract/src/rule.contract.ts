import { z } from "zod";
import { LibraryIdSchema, RuleIdSchema } from "./ids";

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

export const LibraryRuleSchema = z.intersection(
  RuleValueSchema,
  z.object({
    enabled: z.boolean(),
  }),
);
export type LibraryRule = z.infer<typeof LibraryRuleSchema>;

export const LibraryRulesSchema = z
  .array(LibraryRuleSchema)
  .refine((rules) => new Set(rules.map((r) => r.type)).size === rules.length, {
    message: "Only one rule per type is allowed",
  });

export const MismatchSchema = z.object({
  rule: RuleValueSchema,
  reason: z.string(),
});
export type Mismatch = z.infer<typeof MismatchSchema>;
