/**
 * Prints Vitest's json-summary coverage as a Markdown table, for the GitHub Actions
 * job summary: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const METRICS = [
  ['lines', 'Lines'],
  ['statements', 'Statements'],
  ['functions', 'Functions'],
  ['branches', 'Branches'],
];

export function formatCoverageSummary(summary) {
  const { total } = summary;
  if (!total) throw new Error('Coverage summary has no "total" section');

  const rows = METRICS.map(([key, label]) => {
    const { pct, covered, total: count } = total[key];
    return `| ${label} | ${pct}% | ${covered} / ${count} |`;
  });
  return ['## Test coverage', '', '| Metric | Coverage | Covered |', '| --- | ---: | ---: |', ...rows, ''].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? 'coverage/coverage-summary.json';
  process.stdout.write(formatCoverageSummary(JSON.parse(readFileSync(file, 'utf8'))));
}
