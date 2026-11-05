/** The monochrome icons the player and the phone remote both draw: one list of SVG path
 *  `d` strings per icon, all in `iconViewBox`, filled with the current text colour. */
export const iconViewBox = '0 0 24 24';

const speakerBody = 'M3 9v6h4l5 5V4L7 9H3z';

export const icons = {
  play: ['M8 5v14l11-7z'],
  pause: ['M6 5h4v14H6zM14 5h4v14h-4z'],
  previous: ['M6 6h2v12H6zM9.5 12l8.5 6V6z'],
  next: ['M16 6h2v12h-2zM6 18l8.5-6L6 6z'],
  speakerAudible: [speakerBody, 'M16.5 12A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'],
  speakerMuted: [speakerBody, 'M16.3 9.7l1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3-2.3-2.3z'],
} as const;

export type IconName = keyof typeof icons;
