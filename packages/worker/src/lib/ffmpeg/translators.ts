import type { RuleType, RuleValue } from "@formatarr/contract";
import type { Plan } from "@/lib/ffmpeg/plan";

type Value<T extends RuleType> = Extract<RuleValue, { type: T }>["value"];

type Translators = {
  [T in RuleType]: (plan: Plan, value: Value<T>) => Plan;
};

export const translators: Translators = {
  container: (plan, container) => ({ ...plan, container }),
  videoCodec: (plan, codec) => ({ ...plan, video: { ...plan.video, codec } }),
  maxResolution: (plan, height) => ({
    ...plan,
    video: { ...plan.video, height },
  }),
  maxBitrate: (plan, maxBitrate) => ({
    ...plan,
    video: { ...plan.video, maxBitrate },
  }),
  audioCodec: (plan, codec) => ({
    ...plan,
    audio: plan.audio.map((track) =>
      track.codec === codec ? track : { ...track, target: codec },
    ),
  }),
  subtitleLanguages: (plan, languages) => ({
    ...plan,
    subtitles: plan.subtitles.filter(
      ({ language }) => language === null || languages.includes(language),
    ),
  }),
};

export function applyRule(plan: Plan, rule: RuleValue): Plan {
  const translate = translators[rule.type] as (
    plan: Plan,
    value: RuleValue["value"],
  ) => Plan;
  return translate(plan, rule.value);
}
