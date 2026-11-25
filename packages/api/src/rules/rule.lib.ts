import type { MediaInfo, RuleValue } from "@formatarr/contract";

function onlyAllowed(tracks: { language: string | null }[], allowed: string[]) {
  return tracks.every(
    ({ language }) => language === null || allowed.includes(language),
  );
}

export function isRuleSatisified(
  rule: RuleValue,
  mediaInfo: MediaInfo,
): boolean {
  switch (rule.type) {
    case "container":
      return mediaInfo.container === rule.value;
    case "videoCodec":
      return mediaInfo.video.codec === rule.value;
    case "maxResolution":
      return mediaInfo.video.height <= rule.value;
    case "maxBitrate":
      return mediaInfo.bitrate <= rule.value;
    case "audioCodec":
      return mediaInfo.audio.every((track) => track.codec === rule.value);
    case "audioLanguages":
      return onlyAllowed(mediaInfo.audio, rule.value);
    case "subtitleLanguages":
      return onlyAllowed(mediaInfo.subtitles, rule.value);
  }
}

export function findUnmetRules<R extends RuleValue>(
  rules: R[],
  mediaInfo: MediaInfo,
): R[] {
  return rules.filter((rule) => !isRuleSatisified(rule, mediaInfo));
}
