/** The look the player and the phone remote share. styles.css keeps a copy of these as
 *  CSS variables (webpack cannot import TypeScript into CSS); tests/unit/theme.test.ts
 *  fails when the two differ. */
export const controlFill = 'rgba(255, 255, 255, 0.1)';
export const controlFillActive = 'rgba(255, 255, 255, 0.2)';

export const fontStack =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";

export const theme = {
  '--bg-primary': '#1a1a1a',
  '--bg-secondary': '#2a2a2a',
  '--bg-tertiary': '#3a3a3a',
  '--text-primary': '#ffffff',
  '--text-secondary': '#b0b0b0',
  '--accent': '#4a9eff',
  '--accent-hover': '#3a8eef',
  '--error': '#ff4a4a',
  '--success': '#4aff4a',
  '--control-fill': controlFill,
  '--control-fill-active': controlFillActive,
} as const;

/** The `:root` rule that declares every shared variable. */
export function rootBlock(): string {
  const declarations = Object.entries(theme).map(([name, value]) => `${name}: ${value};`);
  return `:root { ${declarations.join(' ')} }`;
}
