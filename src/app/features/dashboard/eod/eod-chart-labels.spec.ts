import { describe, expect, it } from 'vitest';

import { buildEodChart } from './eod-chart.util';

describe('EOD chart axis labels', () => {
  it('use the fixed "Sep" month name', () => {
    const rows = [
      { date: '2026-09-01', close: 100 },
      { date: '2026-09-15', close: 110 },
      { date: '2026-09-30', close: 105 },
    ];
    const labels = buildEodChart(rows).xTicks.map((tick) => tick.label);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^\d{2} Sep$/);
    }
  });
});
