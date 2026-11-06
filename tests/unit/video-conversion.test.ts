import { describe, it, expect } from 'vitest';
import {
  buildConversionArgs,
  detectVideoConversion,
  fitWithin1080p,
} from '@/main/video-conversion';
import netflixProfile5 from '../fixtures/ffprobe-dolby-vision-p5.json';

const video = (overrides: Record<string, unknown> = {}) => ({
  index: 0,
  codec_type: 'video',
  codec_name: 'hevc',
  width: 3840,
  height: 2160,
  ...overrides,
});

const doviRecord = (profile: number, compatibilityId: number) => ({
  side_data_type: 'DOVI configuration record',
  dv_profile: profile,
  dv_bl_signal_compatibility_id: compatibilityId,
});

describe('detectVideoConversion', () => {
  it('converts the Netflix Dolby Vision profile 5 file, keeping its size', () => {
    expect(detectVideoConversion(netflixProfile5)).toEqual({ kind: 'dolby-vision-sdr', width: 3840, height: 2160 });
  });

  it('leaves profile 8.1, whose base layer is HDR10 compatible, alone', () => {
    const probe = { streams: [video({ side_data_list: [doviRecord(8, 1)] })] };
    expect(detectVideoConversion(probe)).toBeNull();
  });

  it('leaves plain HEVC SDR alone', () => {
    expect(detectVideoConversion({ streams: [video()] })).toBeNull();
  });

  it('leaves H.264 alone', () => {
    expect(detectVideoConversion({ streams: [video({ codec_name: 'h264', width: 1920, height: 1080 })] })).toBeNull();
  });

  it('ignores side data that is not a Dolby Vision record', () => {
    const probe = { streams: [video({ side_data_list: [{ side_data_type: 'Mastering display metadata' }] })] };
    expect(detectVideoConversion(probe)).toBeNull();
  });

  it('says nothing for a file without video, or without streams at all', () => {
    expect(detectVideoConversion({ streams: [{ codec_type: 'audio', codec_name: 'aac' }] })).toBeNull();
    expect(detectVideoConversion({})).toBeNull();
  });

  it('judges the first video stream, as the player plays it', () => {
    const probe = { streams: [video(), video({ index: 1, side_data_list: [doviRecord(5, 0)] })] };
    expect(detectVideoConversion(probe)).toBeNull();
  });

  it('does not convert a Dolby Vision stream whose size is unknown', () => {
    const probe = { streams: [video({ width: undefined, side_data_list: [doviRecord(5, 0)] })] };
    expect(detectVideoConversion(probe)).toBeNull();
  });
});

describe('fitWithin1080p', () => {
  it('scales 4K down to 1920 x 1080', () => {
    expect(fitWithin1080p(3840, 2160)).toEqual({ width: 1920, height: 1080 });
  });

  it('never upscales a smaller video', () => {
    expect(fitWithin1080p(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it('keeps the aspect ratio and even sides (cinema 4K)', () => {
    expect(fitWithin1080p(4096, 2160)).toEqual({ width: 1920, height: 1012 });
  });

  it('fits a tall video into the height limit', () => {
    expect(fitWithin1080p(2160, 3840)).toEqual({ width: 608, height: 1080 });
  });
});

describe('buildConversionArgs', () => {
  const value = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  it('scales a 4K source to 1080p, then applies the Dolby Vision reshaping and tone-maps to BT.709', () => {
    const args = buildConversionArgs({ platform: 'linux', width: 3840, height: 2160 });
    expect(value(args, '-vf')).toBe(
      'scale=1920:1080,tonemapx=tonemap=bt2390:desat=0:peak=100:t=bt709:m=bt709:p=bt709:format=yuv420p:range=tv',
    );
  });

  it('keeps a 720p source at 720p', () => {
    const args = buildConversionArgs({ platform: 'linux', width: 1280, height: 720 });
    expect(value(args, '-vf')).toMatch(/^scale=1280:720,tonemapx=/);
  });

  it('uses VideoToolbox on macOS', () => {
    const args = buildConversionArgs({ platform: 'darwin', width: 3840, height: 2160 });
    expect(value(args, '-c:v')).toBe('h264_videotoolbox');
    expect(value(args, '-b:v')).toBe('8M');
  });

  it.each(['linux', 'win32'] as const)('uses libx264 on %s', (platform) => {
    const args = buildConversionArgs({ platform, width: 3840, height: 2160 });
    expect(value(args, '-c:v')).toBe('libx264');
    expect(value(args, '-preset')).toBe('veryfast');
    expect(value(args, '-crf')).toBe('20');
  });

  it('delivers 8-bit 4:2:0 tagged as BT.709', () => {
    const args = buildConversionArgs({ platform: 'linux', width: 3840, height: 2160 });
    expect(value(args, '-pix_fmt')).toBe('yuv420p');
    expect(value(args, '-color_range')).toBe('tv');
    expect(value(args, '-colorspace')).toBe('bt709');
    expect(value(args, '-color_primaries')).toBe('bt709');
    expect(value(args, '-color_trc')).toBe('bt709');
  });

  it('takes the first video stream', () => {
    const args = buildConversionArgs({ platform: 'linux', width: 3840, height: 2160 });
    expect(args.slice(0, 2)).toEqual(['-map', '0:v:0']);
  });
});
