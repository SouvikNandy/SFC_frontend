import { MAX_RANGE_MESSAGE } from '../../../shared/utils/date-range';
import { EodDataRow } from '../eod/eod.model';
import { LegSelection, LegSeries } from './multi-leg-eod.model';
import {
  PRESET_SESSIONS,
  buildLegChart,
  buildSessions,
  combinedCsv,
  combinedRows,
  csvCell,
  csvFilename,
  isLegComplete,
  legLabel,
  pageSlice,
  resolveRange,
  singleLegCsv,
  singleLegRows,
} from './multi-leg-eod.util';

const bar = (date: string, close: number, extra: Partial<EodDataRow> = {}): EodDataRow =>
  ({ date, symbol: 'NIFTY', open: close - 1, high: close + 2, low: close - 2, close, volume: 12345, oi: 987654, ...extra });

const leg = (id: number, optionType: 'CE' | 'PE', strike: number, expiry = '2026-10-29'): LegSelection => ({ id, optionType, strike, expiry });
const series = (l: LegSelection, rows: EodDataRow[]): LegSeries => ({ leg: l, label: legLabel(l), status: 'ready', rows });

describe('resolveRange (UTC-safe)', () => {
  it('presets request a window wide enough for 5 / 21 / 63 sessions ending today', () => {
    expect(resolveRange('1W', '2026-10-16', '', '')).toEqual({ range: { from: '2026-10-01', till: '2026-10-16' } });
    expect(resolveRange('1M', '2026-10-16', '', '')).toEqual({ range: { from: '2026-09-05', till: '2026-10-16' } });
    expect(resolveRange('3M', '2026-10-16', '', '')).toEqual({ range: { from: '2026-06-30', till: '2026-10-16' } });
  });
  it('crosses year boundaries without off-by-one errors', () => {
    expect(resolveRange('3M', '2026-01-31', '', '')).toEqual({ range: { from: '2025-10-15', till: '2026-01-31' } });
    expect(resolveRange('1W', '2026-01-03', '', '')).toEqual({ range: { from: '2025-12-19', till: '2026-01-03' } });
  });
  it('validates the custom range', () => {
    expect(resolveRange('Custom', '2026-10-16', '2026-10-01', '2026-10-10')).toEqual({ range: { from: '2026-10-01', till: '2026-10-10' } });
    expect(resolveRange('Custom', '2026-10-16', '2026-10-10', '2026-10-01')).toEqual({ error: 'From date cannot be after To date.' });
    expect(resolveRange('Custom', '2026-10-16', '', '2026-10-01')).toMatchObject({ error: expect.stringMatching(/both/) });
    expect(resolveRange('Custom', '2026-10-16', '2026-02-31', '2026-03-01')).toMatchObject({ error: expect.stringMatching(/valid/) });
    expect(resolveRange('Custom', '2026-10-16', '2026-10-01', '2026-10-20')).toMatchObject({ error: expect.stringMatching(/future/) });
  });
  it('limits a custom range to one calendar year, inclusive', () => {
    expect(resolveRange('Custom', '2026-10-18', '2025-10-18', '2026-10-18')).toEqual({ range: { from: '2025-10-18', till: '2026-10-18' } });
    expect(resolveRange('Custom', '2026-10-18', '2025-10-17', '2026-10-18')).toEqual({ error: MAX_RANGE_MESSAGE });
    expect(resolveRange('Custom', '2026-10-18', '2024-02-29', '2025-02-28')).toMatchObject({ range: { from: '2024-02-29', till: '2025-02-28' } });
    expect(resolveRange('Custom', '2026-10-18', '2024-02-29', '2025-03-01')).toEqual({ error: MAX_RANGE_MESSAGE });
    expect(resolveRange('Custom', '2026-10-18', '2025-01-31', '2026-01-31')).toMatchObject({ range: { from: '2025-01-31', till: '2026-01-31' } });
  });
  it('reports the earlier problem first: reversed, future and malformed dates are not "too long"', () => {
    expect(resolveRange('Custom', '2026-10-18', '2026-10-18', '2024-01-01')).toEqual({ error: 'From date cannot be after To date.' });
    expect(resolveRange('Custom', '2026-10-18', '2020-01-01', '2026-10-19')).toMatchObject({ error: expect.stringMatching(/future/) });
    expect(resolveRange('Custom', '2026-10-18', '2020-01-01', '2026-02-31')).toMatchObject({ error: expect.stringMatching(/valid/) });
  });
  it('does not touch presets', () => {
    expect(resolveRange('3M', '2026-10-16', '2000-01-01', '2026-10-16')).toEqual({ range: { from: '2026-06-30', till: '2026-10-16' } });
  });
});

describe('session presets', () => {
  it('are 5 / 21 / 63 sessions, as in the reference', () => expect(PRESET_SESSIONS).toEqual({ '1W': 5, '1M': 21, '3M': 63 }));
});

describe('legs', () => {
  it('labels and completeness', () => {
    expect(legLabel(leg(1, 'CE', 22600, '2026-10-29'))).toBe('22600 CE · 29 Oct');
    expect(isLegComplete(leg(1, 'PE', 22600))).toBe(true);
    expect(isLegComplete({ id: 1, optionType: 'PE', strike: null, expiry: '2026-10-29' })).toBe(false);
    expect(isLegComplete({ id: 1, optionType: 'PE', strike: 100, expiry: 'bad' })).toBe(false);
  });
});

describe('sessions', () => {
  const a = series(leg(1, 'CE', 22600), [bar('2026-10-01', 100), bar('2026-10-02', 110), bar('2026-10-05', 105)]);
  const b = series(leg(2, 'PE', 22600, '2026-10-02'), [bar('2026-09-30', 50), bar('2026-10-01', 45), bar('2026-10-02', 40)]); // expired 2 Oct

  it('keeps a session when any leg has a bar and leaves gaps as null', () => {
    const sessions = buildSessions([a, b]);
    expect(sessions.map(s => s.date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05']);
    expect(sessions[0].bars[0]).toBeNull();           // CE not yet listed
    expect(sessions[3].bars[1]).toBeNull();           // PE already expired
  });

  it('drops sessions outside the requested window', () => {
    expect(buildSessions([a, b], { from: '2026-10-01', till: '2026-10-02' }).map(s => s.date)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('no data at all gives no sessions and no chart', () => {
    const empty = series(leg(1, 'CE', 1), []);
    expect(buildSessions([empty])).toEqual([]);
    expect(buildLegChart([], [empty], false)).toBeNull();
  });

  it('chart: one line per leg, pen lifted over gaps, only finite coordinates', () => {
    const gap = series(leg(3, 'CE', 22700), [bar('2026-10-01', 20), bar('2026-10-05', 25)]);
    const chart = buildLegChart(buildSessions([a, gap]), [a, gap], false)!;
    expect(chart.lines).toHaveLength(2);
    expect(chart.lines[1].path.match(/M/g)).toHaveLength(2);   // two separate segments: the gap breaks the line
    expect(chart.lines[0].path.match(/M/g)).toHaveLength(1);
    expect(chart.lines.every(l => !/NaN|Infinity/.test(l.path))).toBe(true);
    expect(chart.xs).toHaveLength(3);
    expect(chart.yTicks).toHaveLength(5);
  });

  it('chart: a single session or flat prices do not divide by zero', () => {
    const one = series(leg(1, 'CE', 1), [bar('2026-10-01', 100)]);
    const chart = buildLegChart(buildSessions([one]), [one], true)!;
    expect(chart.lines[0].dots).toHaveLength(1);
    expect(chart.lines[0].path).not.toMatch(/NaN/);
  });
});

describe('tables', () => {
  const a = series(leg(1, 'CE', 22600), [bar('2026-10-01', 100), bar('2026-10-02', 110), bar('2026-10-03', 105)]);
  const b = series(leg(2, 'PE', 22600), [bar('2026-10-02', 40)]);
  const sessions = buildSessions([a, b]);

  it('combined view: latest first, a close per leg, change vs that leg previous close, missing explicit', () => {
    const rows = combinedRows(sessions, 2);
    expect(rows.map(r => r.date)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
    expect(rows[0].closes).toEqual([105, null]);
    expect(rows[0].changes).toEqual([-5, null]);
    expect(rows[1].changes).toEqual([10, null]);   // PE first bar has no previous
    expect(rows[2].closes[1]).toBeNull();
  });

  it('single leg view: OHLC bar per session, null for missing', () => {
    const rows = singleLegRows(sessions, 1);
    expect(rows[0].bar).toBeNull();
    expect(rows[1].bar?.close).toBe(40);
    expect(singleLegRows(sessions, 0)[1].change).toBe(10);
  });

  it('pagination slices, clamps and reports page count', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(pageSlice(items, 0, 10)).toMatchObject({ pages: 3, page: 0, slice: items.slice(0, 10) });
    expect(pageSlice(items, 2, 10).slice).toHaveLength(3);
    expect(pageSlice(items, 9, 10).page).toBe(2);
    expect(pageSlice([], 0, 10)).toMatchObject({ pages: 1, page: 0, slice: [] });
  });
});

describe('CSV', () => {
  const a = series(leg(1, 'CE', 22600), [bar('2026-10-01', 100.5), bar('2026-10-02', 110)]);
  const b = series(leg(2, 'PE', 22400, '2026-11-26'), [bar('2026-10-02', 40.25)]);
  const sessions = buildSessions([a, b]);

  it('combined: Date + one close column per leg, blanks for missing, oldest first', () => {
    expect(combinedCsv(sessions, [a, b]).split('\n')).toEqual([
      'Date,22600 CE · 29 Oct,22400 PE · 26 Nov',
      '2026-10-01,100.50,',
      '2026-10-02,110.00,40.25',
    ]);
  });

  it('single leg: OHLC, volume and OI, skipping sessions the leg has no bar', () => {
    expect(singleLegCsv(sessions, 1).split('\n')).toEqual(['Date,Open,High,Low,Close,Volume,OI', '2026-10-02,39.25,42.25,38.25,40.25,12345,987654']);
  });

  it('a field the backend did not send is left empty, not zero', () => {
    const missing = series(leg(1, 'CE', 1), [bar('2026-10-01', 10, { volume: Number.NaN, oi: Number.NaN })]);
    expect(singleLegCsv(buildSessions([missing]), 0).split('\n')[1]).toBe('2026-10-01,9.00,12.00,8.00,10.00,,');
  });

  it('escapes quotes, commas, newlines and formula characters', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-5.00')).toBe('-5.00');
    expect(csvCell(null)).toBe('');
  });

  it('filename keeps symbol and leg identity and is filesystem safe', () => {
    expect(csvFilename('NIFTY', [leg(1, 'CE', 22600)])).toBe('NIFTY_22600CE_2026-10-29_EOD.csv');
    expect(csvFilename('NIFTY', [leg(1, 'CE', 22600), leg(2, 'PE', 22400, '2026-11-26')])).toBe('NIFTY_22600CE_2026-10-29_22400PE_2026-11-26_EOD.csv');
    expect(csvFilename('M&M/FIN', [leg(1, 'CE', 1)])).toBe('M_M_FIN_1CE_2026-10-29_EOD.csv');
  });
});
