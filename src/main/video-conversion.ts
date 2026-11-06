/** What the player converts a video into, decided from what ffprobe says about it. */
export type VideoConversionKind = 'dolby-vision-sdr';

export interface VideoConversion {
  kind: VideoConversionKind;
  /** The source's size; the converted video is scaled down from it. */
  width: number;
  height: number;
}

/** The `video` parameter of a stream URL that asks for a converted picture. */
export const VIDEO_CONVERSION_PARAM = 'video';
export const DOLBY_VISION_SDR_VALUE = 'sdr';

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const DOVI_RECORD = 'DOVI configuration record';

interface ProbedStream {
  codec_type?: string;
  width?: number;
  height?: number;
  side_data_list?: { side_data_type?: string; dv_bl_signal_compatibility_id?: number }[];
}

/**
 * Dolby Vision without a compatible base layer (profile 5, compatibility id 0) keeps
 * its picture in Dolby's own colour space; Chromium shows it with a purple and green
 * cast. Profiles 7 and 8.x carry an HDR10 or SDR base layer and play as they are.
 */
export function detectVideoConversion(probe: { streams?: ProbedStream[] }): VideoConversion | null {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height) return null;

  const record = video.side_data_list?.find((data) => data.side_data_type === DOVI_RECORD);
  if (record?.dv_bl_signal_compatibility_id !== 0) return null;

  return { kind: 'dolby-vision-sdr', width: video.width, height: video.height };
}

const toEven = (value: number) => Math.max(2, 2 * Math.round(value / 2));

/** The size that fits 1920 x 1080 with the same aspect ratio, even sides, never larger than the source. */
export function fitWithin1080p(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return scale === 1 ? { width, height } : { width: toEven(width * scale), height: toEven(height * scale) };
}

function encoderArgs(platform: NodeJS.Platform): string[] {
  return platform === 'darwin'
    ? ['-c:v', 'h264_videotoolbox', '-b:v', '8M']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-tune', 'film'];
}

/**
 * ffmpeg output options for the converted video. The picture is scaled first, so the
 * reshaping and tone mapping run at 1080p instead of 4K (which is too slow to keep up
 * with playback); the filter applies the Dolby Vision metadata it finds on each frame.
 */
export function buildConversionArgs({ platform, width, height }: { platform: NodeJS.Platform; width: number; height: number }): string[] {
  const size = fitWithin1080p(width, height);
  const toneMap = 'tonemapx=tonemap=bt2390:desat=0:peak=100:t=bt709:m=bt709:p=bt709:format=yuv420p:range=tv';
  return [
    '-map', '0:v:0',
    '-vf', `scale=${size.width}:${size.height},${toneMap}`,
    ...encoderArgs(platform),
    '-pix_fmt', 'yuv420p',
    // Limited range is what browsers expect from H.264; the stream would otherwise inherit the source's tag.
    '-color_range', 'tv',
    '-colorspace', 'bt709',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
  ];
}
