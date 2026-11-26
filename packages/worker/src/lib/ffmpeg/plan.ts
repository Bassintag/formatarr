import type { AudioCodec, MediaInfo, VideoCodec } from "@formatarr/contract";

type SourceTrack<T> = T & { index: number };

export type AudioTrack = SourceTrack<MediaInfo["audio"][number]> & {
  target?: AudioCodec;
};

export type SubtitleTrack = SourceTrack<MediaInfo["subtitles"][number]>;

export type VideoSettings = {
  codec?: VideoCodec;
  height?: number;
  maxBitrate?: number;
};

export type Plan = {
  container: string;
  video?: VideoSettings;
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
};

function indexed<T>(tracks: T[]): SourceTrack<T>[] {
  return tracks.map((track, index) => ({ ...track, index }));
}

export function createPlan(mediaInfo: MediaInfo): Plan {
  return {
    container: mediaInfo.container,
    audio: indexed(mediaInfo.audio),
    subtitles: indexed(mediaInfo.subtitles),
  };
}
