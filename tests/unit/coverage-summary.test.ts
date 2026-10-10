import { describe, it, expect } from 'vitest';
import { formatCoverageSummary } from '../../scripts/coverage-summary.mjs';

const metric = (pct: number, covered: number, total: number) => ({ pct, covered, total, skipped: 0 });

const summary = {
  total: {
    lines: metric(65.66, 2293, 3492),
    statements: metric(65.66, 2293, 3492),
    functions: metric(60.9, 81, 133),
    branches: metric(80.48, 334, 415),
  },
};

describe('formatCoverageSummary (#21)', () => {
  it('renders a Markdown table with one row per metric', () => {
    const markdown = formatCoverageSummary(summary);

    expect(markdown).toContain('## Test coverage');
    expect(markdown).toContain('| Metric | Coverage | Covered |');
    expect(markdown).toContain('| Lines | 65.66% | 2293 / 3492 |');
    expect(markdown).toContain('| Statements | 65.66% | 2293 / 3492 |');
    expect(markdown).toContain('| Functions | 60.9% | 81 / 133 |');
    expect(markdown).toContain('| Branches | 80.48% | 334 / 415 |');
  });

  it('fails loudly on a summary without totals', () => {
    expect(() => formatCoverageSummary({})).toThrow(/total/);
  });
});
