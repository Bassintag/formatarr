import { type Task, VideoCodecSchema } from "@formatarr/contract";
import {
  AUDIO_ENCODERS,
  MAX_CHANNELS,
  MP4_AUDIO_CODECS,
  TEXT_SUBTITLE_CODECS,
} from "@/lib/ffmpeg/codecs";
import { type Accelerators, videoEncoder } from "@/lib/ffmpeg/encoders";
import { createPlan, type Plan } from "@/lib/ffmpeg/plan";
import { applyRule } from "@/lib/ffmpeg/translators";

const TARGET_BITRATE_RATIO = 0.9;

function videoArgs(
  { video }: Plan,
  sourceCodec: string,
  accelerators: Accelerators,
) {
  if (!video) return { globalArgs: [], args: [] };
  const codec =
    video.codec ?? VideoCodecSchema.safeParse(sourceCodec).data ?? "h264";
  const encoder = videoEncoder(codec, accelerators[codec]);
  const args = ["-c:v", encoder.name];

  const filters = [...encoder.filters];
  if (video.height) {
    filters.unshift(`scale=-2:${video.height - (video.height % 2)}`);
  }
  if (filters.length > 0) args.push("-filter:v", filters.join(","));

  const max = video.maxBitrate;
  if (max) {
    args.push("-b:v", `${Math.floor(max * TARGET_BITRATE_RATIO)}`);
    if (encoder.name !== "libsvtav1") {
      args.push("-maxrate", `${max}`, "-bufsize", `${max * 2}`);
    }
  } else {
    args.push(...encoder.qualityArgs);
  }

  args.push(
    "-metadata:s:v:0",
    `BPS=${max ?? ""}`,
    "-metadata:s:v:0",
    "BPS-eng=",
  );
  return { globalArgs: encoder.globalArgs, args };
}

function audioArgs({ container, audio }: Plan) {
  return audio.flatMap((track, output) => {
    const incompatible =
      container === "mp4" && !MP4_AUDIO_CODECS.has(track.codec);
    const codec = track.target ?? (incompatible ? "aac" : undefined);
    if (!codec) return [];
    const args = [`-c:a:${output}`, AUDIO_ENCODERS[codec]];

    const maxChannels = MAX_CHANNELS[codec];
    if (maxChannels && track.channels > maxChannels) {
      args.push(`-ac:a:${output}`, `${maxChannels}`);
    }
    if (codec === "opus") {
      args.push(
        `-filter:a:${output}`,
        "aformat=channel_layouts=7.1|5.1|stereo|mono",
      );
    }
    return args;
  });
}

function compatibleSubtitles({ container, subtitles }: Plan) {
  if (container !== "mp4") return subtitles;
  return subtitles.filter(({ codec }) => TEXT_SUBTITLE_CODECS.has(codec));
}

function subtitleArgs(plan: Plan) {
  return compatibleSubtitles(plan).flatMap(({ codec }, output) => {
    if (plan.container === "mp4" && codec !== "mov_text") {
      return [`-c:s:${output}`, "mov_text"];
    }
    if (plan.container === "mkv" && codec === "mov_text") {
      return [`-c:s:${output}`, "srt"];
    }
    return [];
  });
}

function mapArgs(plan: Plan) {
  const streams = [
    "0:v:0",
    ...plan.audio.map(({ index }) => `0:a:${index}`),
    ...compatibleSubtitles(plan).map(({ index }) => `0:s:${index}`),
  ];
  if (plan.container === "mkv") streams.push("0:t?");
  return streams.flatMap((stream) => ["-map", stream]);
}

export type TranscodeInput = Pick<Task, "job" | "mediaInfo"> & {
  sourcePath: string;
  outputPath: string;
};

export function buildFfmpegArgs(
  { job, sourcePath, outputPath, mediaInfo }: TranscodeInput,
  accelerators: Accelerators = {},
) {
  const plan = job.rules
    .filter((rule) => rule.enabled)
    .reduce(applyRule, createPlan(mediaInfo));
  const video = videoArgs(plan, mediaInfo.video.codec, accelerators);

  return [
    ...video.globalArgs,
    "-i",
    sourcePath,
    ...mapArgs(plan),
    "-c",
    "copy",
    ...video.args,
    ...audioArgs(plan),
    ...subtitleArgs(plan),
    outputPath,
  ];
}
