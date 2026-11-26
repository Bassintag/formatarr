import { type VideoCodec, VideoCodecSchema } from "@formatarr/contract";
import { VIDEO_ENCODERS } from "@/lib/ffmpeg/codecs";

const ACCELERATORS = ["nvenc", "qsv", "vaapi"] as const;
export type Accelerator = (typeof ACCELERATORS)[number];
export type Accelerators = Partial<Record<VideoCodec, Accelerator>>;

type VideoEncoder = {
  name: string;
  globalArgs: string[];
  filters: string[];
  qualityArgs: string[];
};

const QUALITY: Record<VideoCodec, number> = {
  h264: 23,
  hevc: 28,
  av1: 35,
  vp9: 32,
};

const VAAPI_QUALITY: Record<VideoCodec, number> = {
  ...QUALITY,
  av1: 140,
  vp9: 128,
};

function pixelFormat(codec: VideoCodec) {
  return codec === "h264" ? "format=nv12" : "format=nv12|p010le";
}

export function videoEncoder(
  codec: VideoCodec,
  accelerator?: Accelerator,
): VideoEncoder {
  if (!accelerator) {
    return {
      name: VIDEO_ENCODERS[codec],
      globalArgs: [],
      filters: [],
      qualityArgs:
        codec === "vp9" ? ["-crf", `${QUALITY.vp9}`, "-b:v", "0"] : [],
    };
  }

  const encoder = {
    name: `${codec}_${accelerator}`,
    globalArgs: [],
    filters: [pixelFormat(codec)],
  };
  switch (accelerator) {
    case "nvenc":
      return {
        ...encoder,
        qualityArgs: ["-cq", `${QUALITY[codec]}`, "-b:v", "0"],
      };
    case "qsv":
      return {
        ...encoder,
        qualityArgs: ["-global_quality", `${QUALITY[codec]}`],
      };
    case "vaapi":
      return {
        ...encoder,
        globalArgs: ["-init_hw_device", "vaapi=hw", "-filter_hw_device", "hw"],
        filters: [...encoder.filters, "hwupload"],
        qualityArgs: ["-global_quality", `${VAAPI_QUALITY[codec]}`],
      };
  }
}

async function canEncode(
  ffmpegPath: string,
  codec: VideoCodec,
  accelerator: Accelerator,
) {
  const { name, globalArgs, filters, qualityArgs } = videoEncoder(
    codec,
    accelerator,
  );
  const ffmpeg = Bun.spawn(
    [
      ffmpegPath,
      "-nostdin",
      "-v",
      "quiet",
      ...globalArgs,
      "-f",
      "lavfi",
      "-i",
      "color=s=640x360",
      "-filter:v",
      filters.join(","),
      "-c:v",
      name,
      ...qualityArgs,
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  return (await ffmpeg.exited) === 0;
}

export async function detectAccelerators(ffmpegPath: string) {
  const detected: Accelerators = {};
  for (const codec of VideoCodecSchema.options) {
    for (const accelerator of ACCELERATORS) {
      if (await canEncode(ffmpegPath, codec, accelerator)) {
        detected[codec] = accelerator;
        break;
      }
    }
  }
  return detected;
}
