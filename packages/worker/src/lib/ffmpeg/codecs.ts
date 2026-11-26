import type { AudioCodec, VideoCodec } from "@formatarr/contract";

export const VIDEO_ENCODERS: Record<VideoCodec, string> = {
  h264: "libx264",
  hevc: "libx265",
  av1: "libsvtav1",
  vp9: "libvpx-vp9",
};

export const AUDIO_ENCODERS: Record<AudioCodec, string> = {
  aac: "aac",
  ac3: "ac3",
  eac3: "eac3",
  opus: "libopus",
  mp3: "libmp3lame",
  flac: "flac",
};

export const MAX_CHANNELS: Partial<Record<AudioCodec, number>> = {
  ac3: 6,
  eac3: 6,
  mp3: 2,
};

export const MP4_AUDIO_CODECS = new Set([
  "aac",
  "ac3",
  "eac3",
  "opus",
  "mp3",
  "flac",
  "alac",
  "dts",
]);

export const TEXT_SUBTITLE_CODECS = new Set([
  "subrip",
  "ass",
  "ssa",
  "webvtt",
  "mov_text",
  "text",
]);
