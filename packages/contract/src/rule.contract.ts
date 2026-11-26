import { z } from "zod";
import { LibraryIdSchema, RuleIdSchema } from "./ids";

export const ContainerSchema = z.enum(["mkv", "mp4"]);
export type Container = z.infer<typeof ContainerSchema>;

export const VideoCodecSchema = z.enum(["h264", "hevc", "av1", "vp9"]);
export type VideoCodec = z.infer<typeof VideoCodecSchema>;

export const AudioCodecSchema = z.enum([
  "aac",
  "ac3",
  "eac3",
  "opus",
  "mp3",
  "flac",
]);
export type AudioCodec = z.infer<typeof AudioCodecSchema>;

const PositiveIntSchema = z.number().int().positive();
const LanguagesSchema = z.array(z.string().min(1));

export const RuleTypeSchema = z.enum([
  "container",
  "videoCodec",
  "maxResolution",
  "maxBitrate",
  "audioCodec",
  "subtitleLanguages",
]);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const RuleValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("container"), value: ContainerSchema }),
  z.object({ type: z.literal("videoCodec"), value: VideoCodecSchema }),
  z.object({ type: z.literal("maxResolution"), value: PositiveIntSchema }),
  z.object({ type: z.literal("maxBitrate"), value: PositiveIntSchema }),
  z.object({ type: z.literal("audioCodec"), value: AudioCodecSchema }),
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
