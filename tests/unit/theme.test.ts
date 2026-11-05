import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { theme, controlFill, controlFillActive, fontStack, rootBlock } from '@/shared/theme';

const styles = readFileSync(join(__dirname, '../../src/renderer/styles.css'), 'utf8');

describe('shared theme', () => {
  it('holds the values the player uses', () => {
    expect(theme['--bg-primary']).toBe('#1a1a1a');
    expect(theme['--bg-tertiary']).toBe('#3a3a3a');
    expect(theme['--text-secondary']).toBe('#b0b0b0');
    expect(theme['--accent']).toBe('#4a9eff');
    expect(theme['--error']).toBe('#ff4a4a');
    expect(controlFill).toBe('rgba(255, 255, 255, 0.1)');
    expect(controlFillActive).toBe('rgba(255, 255, 255, 0.2)');
  });

  it('renders every variable into a :root block', () => {
    const block = rootBlock();

    expect(block).toMatch(/^:root \{/);
    for (const [name, value] of Object.entries(theme)) expect(block).toContain(`${name}: ${value};`);
  });
});

describe('renderer styles.css', () => {
  const root = /:root\s*\{([^}]*)\}/.exec(styles)![1];
  const declared = Object.fromEntries(
    [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

  it('declares every shared variable with the shared value', () => {
    expect(declared).toEqual(theme);
  });

  it('uses the same font stack as the shared theme', () => {
    expect(styles).toContain(`font-family: ${fontStack};`);
  });

  it('draws the control bar fills from the variables, not literals', () => {
    const controlBar = styles.slice(styles.indexOf('.control-button {'), styles.indexOf('.seek-bar {'));

    expect(controlBar).not.toMatch(/background-color: rgba\(255, 255, 255, 0\.(1|2)\)/);
    expect(controlBar).toContain('var(--control-fill)');
    expect(controlBar).toContain('var(--control-fill-active)');
  });
});
