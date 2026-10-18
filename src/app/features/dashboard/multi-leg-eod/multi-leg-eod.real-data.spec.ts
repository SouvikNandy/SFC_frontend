import { isNoTradeBar } from '../eod/eod-rows.util';
import { EodDataRow } from '../eod/eod.model';
import { LegSelection, LegSeries } from './multi-leg-eod.model';
import { buildLegChart, buildSessions, combinedCsv, combinedRows, legLabel, singleLegCsv, singleLegRows } from './multi-leg-eod.util';

/*
 * Rows captured from the live /fo/eod on 2026-10-17 (NIFTY 23150 CE, 2026-09-28 .. 2026-10-16), as
 * [date, open, high, low, close, volume, oi]. Two legs with different trading dates:
 *  - A: expiry 2026-10-19, traded every session (2026-10-02 is a market holiday: no row at all).
 *  - B: expiry 2026-11-17, listed on 2026-10-14 without trading (OHLC/volume/OI = 0, close carried), traded 15 and 16 Oct.
 */
const A_ROWS = [
  ['2026-09-28', 216.5, 223.3, 161.7, 165.15, 339, 8645], ['2026-09-29', 140.95, 159.2, 117.7, 138.6, 227, 7410],
  ['2026-09-30', 126, 141.85, 82.3, 88.8, 391, 11115], ['2026-10-01', 85.1, 91, 50, 58, 699, 11440],
  ['2026-10-05', 68, 75.15, 50.05, 56.9, 1152, 26260], ['2026-10-06', 53.1, 80.75, 53.1, 68.3, 1078, 49660],
  ['2026-10-07', 50.85, 61.35, 34, 35.8, 20906, 763100], ['2026-10-08', 32.8, 34.25, 13.75, 14.55, 27863, 504400],
  ['2026-10-09', 15, 26.8, 14, 20.45, 26979, 374595], ['2026-10-12', 26, 27, 7.7, 8.6, 41470, 544245],
  ['2026-10-13', 9, 36.45, 6.4, 30.05, 91984, 1152645], ['2026-10-14', 30.05, 30.05, 10, 11.75, 618394, 2102685],
  ['2026-10-15', 11, 81.7, 11, 36.9, 1326243, 2446925], ['2026-10-16', 55.35, 108.7, 26, 69.4, 7453079, 6312280],
] as const;
const B_ROWS = [
  ['2026-10-14', 0, 0, 0, 321.9, 0, 0], ['2026-10-15', 225.95, 364.7, 222.3, 305.25, 88, 4355], ['2026-10-16', 336.35, 394.05, 308.3, 366, 50, 5720],
] as const;

const toRows = (tuples: ReadonlyArray<readonly [string, number, number, number, number, number, number]>): EodDataRow[] =>
  tuples.map(([date, open, high, low, close, volume, oi]) => ({ date, symbol: 'NIFTY', open, high, low, close, volume, oi }));

const legA: LegSelection = { id: 1, optionType: 'CE', strike: 23150, expiry: '2026-10-19' };
const legB: LegSelection = { id: 2, optionType: 'CE', strike: 23150, expiry: '2026-11-17' };
/** The component's per-leg step: sessions without trades are removed before anything is merged. */
const series = (leg: LegSelection, rows: EodDataRow[]): LegSeries => ({ leg, label: legLabel(leg), status: 'ready', rows: rows.filter(row => !isNoTradeBar(row)) });

describe('isNoTradeBar on real /fo/eod rows', () => {
  it('drops only the genuinely untraded session', () => {
    expect(toRows(A_ROWS).filter(isNoTradeBar)).toHaveLength(0);                  // all 14 traded sessions kept
    expect(toRows(B_ROWS).filter(isNoTradeBar).map(r => r.date)).toEqual(['2026-10-14']);
  });

  it('keeps thin trading: very low volume, open equal to high/low, or a quiet single-price day', () => {
    expect(isNoTradeBar({ open: 30.05, high: 30.05, low: 10, volume: 618394 })).toBe(false);
    expect(isNoTradeBar({ open: 336.35, high: 394.05, low: 308.3, volume: 50 })).toBe(false);
    expect(isNoTradeBar({ open: 11, high: 11, low: 11, volume: 1 })).toBe(false);
  });
});

describe('two legs with different trading dates (real rows)', () => {
  const a = series(legA, toRows(A_ROWS));
  const b = series(legB, toRows(B_ROWS));
  const sessions = buildSessions([a, b]);

  it('merges by date: the union of traded dates, holidays and weekends absent, untraded sessions are gaps', () => {
    expect(b.rows.map(r => r.date)).toEqual(['2026-10-15', '2026-10-16']);
    expect(sessions.map(s => s.date)).toEqual(A_ROWS.map(r => r[0]));
    expect(sessions.some(s => s.date === '2026-10-02')).toBe(false);               // holiday: no session, no zero row
    const day14 = sessions.find(s => s.date === '2026-10-14')!;
    expect(day14.bars[0]?.close).toBe(11.75);
    expect(day14.bars[1]).toBeNull();                                              // B's untraded session is not 0 and not 321.9
  });

  it('combined table: latest first, per-leg change vs that leg, explicit gaps', () => {
    const rows = combinedRows(sessions, 2);
    expect(rows.slice(0, 3).map(r => [r.date, r.closes[0], r.closes[1]])).toEqual([
      ['2026-10-16', 69.4, 366], ['2026-10-15', 36.9, 305.25], ['2026-10-14', 11.75, null],
    ]);
    expect(rows[0].changes[1]).toBeCloseTo(60.75, 10);                              // 366 - 305.25
    expect(rows[1].changes[1]).toBeNull();                                          // B's first traded session has no previous close
    expect(rows[0].changes[0]).toBeCloseTo(32.5, 10);
  });

  it('single-leg table: B shows its two sessions, earlier sessions are "not listed / no bar" rows, never zeros', () => {
    const rows = singleLegRows(sessions, 1);
    expect(rows[0].bar).toMatchObject({ date: '2026-10-16', open: 336.35, close: 366, volume: 50, oi: 5720 });
    expect(rows[1].bar?.close).toBe(305.25);
    expect(rows.slice(2).every(r => r.bar === null)).toBe(true);
    expect(rows).toHaveLength(14);
  });

  it('chart: B is drawn from its first traded session only, A has no break across the 2 Oct holiday', () => {
    const chart = buildLegChart(sessions, [a, b], false)!;
    expect(chart.lines[0].dots).toHaveLength(14);
    expect(chart.lines[0].path.match(/M/g)).toHaveLength(1);
    expect(chart.lines[1].dots).toHaveLength(2);
    expect(chart.lines[1].path.match(/M/g)).toHaveLength(1);
    expect(chart.lines.every(l => !/NaN|Infinity/.test(l.path))).toBe(true);
  });

  it('combined CSV: one row per session, a blank (not 0) where a leg has no bar', () => {
    const lines = combinedCsv(sessions, [a, b]).split('\n');
    expect(lines[0]).toBe('Date,23150 CE · 19 Oct,23150 CE · 17 Nov');
    expect(lines).toHaveLength(15);
    expect(lines).toContain('2026-10-14,11.75,');
    expect(lines).toContain('2026-10-15,36.90,305.25');
    expect(lines.at(-1)).toBe('2026-10-16,69.40,366.00');
    expect(lines.some(l => l.startsWith('2026-10-02'))).toBe(false);
    expect(lines.join('\n')).not.toMatch(/,0\.00|NaN/);
  });

  it('single-leg CSV: only traded sessions of that leg, with OHLC, volume and OI', () => {
    expect(singleLegCsv(sessions, 1).split('\n')).toEqual([
      'Date,Open,High,Low,Close,Volume,OI',
      '2026-10-15,225.95,364.70,222.30,305.25,88,4355',
      '2026-10-16,336.35,394.05,308.30,366.00,50,5720',
    ]);
    expect(singleLegCsv(sessions, 0).split('\n')).toHaveLength(15);
  });

  it('range windows keep merged sessions aligned: the date filter applies to the union', () => {
    const windowed = buildSessions([a, b], { from: '2026-10-14', till: '2026-10-16' });
    expect(windowed.map(s => s.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
    expect(windowed[0].bars).toEqual([expect.objectContaining({ close: 11.75 }), null]);
  });
});
