import type { MediaInfo, Mismatch, RuleValue } from "@formatarr/contract";

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

function describeMismatch(rule: RuleValue, mediaInfo: MediaInfo): string {
  switch (rule.type) {
    case "container":
      return `Container is ${mediaInfo.container}, expected ${rule.value}`;
    case "videoCodec":
      return `Video codec is ${mediaInfo.video.codec}, expected ${rule.value}`;
    case "maxResolution":
      return `Resolution ${mediaInfo.video.height}p exceeds max ${rule.value}p`;
    case "maxBitrate":
      return `Bitrate ${mediaInfo.bitrate} exceeds max ${rule.value}`;
    case "audioCodec": {
      const others = new Set(
        mediaInfo.audio
          .map((track) => track.codec)
          .filter((c) => c !== rule.value),
      );
      return `Audio codecs ${[...others].join(", ")} differ from ${rule.value}`;
    }
    case "audioLanguages":
      return `Audio languages not allowed: ${disallowed(mediaInfo.audio, rule.value)}`;
    case "subtitleLanguages":
      return `Subtitle languages not allowed: ${disallowed(mediaInfo.subtitles, rule.value)}`;
  }
}

function disallowed(tracks: { language: string | null }[], allowed: string[]) {
  const languages = new Set<string>();
  for (const { language } of tracks) {
    if (language !== null && !allowed.includes(language)) {
      languages.add(language);
    }
  }
  return [...languages].join(", ");
}

export function findMismatches(
  rules: RuleValue[],
  mediaInfo: MediaInfo,
): Mismatch[] {
  return findUnmetRules(rules, mediaInfo).map((rule) => ({
    rule,
    reason: describeMismatch(rule, mediaInfo),
  }));
}
