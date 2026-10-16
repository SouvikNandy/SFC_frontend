import { ContractRef, LedgerFill } from './models/portfolio.model';
import { makeContract } from './portfolio-contract';
import {
  buildBasketEodSeries,
  buildCurvePoints,
  daysToExpiry,
  filterByExitDate,
  groupClosed,
  maxDrawdown,
  notional,
  periodKey,
  periodLabel,
  periodPnlSeries,
  realisedTotal,
  replayLedger,
  tradeStats,
  unrealised,
  unrealisedTotal,
  validateFill,
  weekStart,
} from './portfolio-ledger';
import { buildBarChart, buildCurveChart } from './portfolio-charts.util';

const FUT = makeContract({ underlying: 'NIFTY', kind: 'future', expiry: '2026-10-29', strike: null, optionType: null, lot: 75 });
const CE = makeContract({ underlying: 'NIFTY', kind: 'option', expiry: '2026-10-29', strike: 22600, optionType: 'CE', lot: 75 });
const PE = makeContract({ underlying: 'NIFTY', kind: 'option', expiry: '2026-10-29', strike: 22400, optionType: 'PE', lot: 75 });

let n = 0;
const fill = (contract: ContractRef, side: 'buy' | 'sell', qty: number, price: number, date: string, basketId: string | null = null): LedgerFill =>
  ({ id: `f${++n}`, contract, side, qty, price, lot: contract.lot, date, basketId });

describe('contracts', () => {
  it('builds stable keys and labels for futures and options', () => {
    expect(FUT.key).toBe('NIFTY|FUT|2026-10-29');
    expect(FUT.label).toBe('NIFTY FUT 29 Oct 2026');
    expect(CE.key).toBe('NIFTY|OPT|2026-10-29|22600|CE');
    expect(CE.label).toBe('NIFTY 22600 CE 29 Oct 2026');
    expect(FUT.strike).toBeNull();
  });
});

describe('weighted-average cost and position state', () => {
  it('opens, then averages multiple fills on the same side', () => {
    const { positions, closed } = replayLedger([fill(CE, 'buy', 2, 100, '2026-10-01'), fill(CE, 'buy', 1, 130, '2026-10-02')], []);
    expect(closed).toHaveLength(0);
    expect(positions).toHaveLength(1);
    expect(positions[0].qty).toBe(3);
    expect(positions[0].avg).toBeCloseTo((2 * 100 + 1 * 130) / 3, 10);
    expect(positions[0].opened).toBe('2026-10-01');
  });

  it('a partial close realises P&L on the closed lots only and keeps the average cost', () => {
    const { positions, closed } = replayLedger([fill(CE, 'buy', 3, 100, '2026-10-01'), fill(CE, 'sell', 1, 140, '2026-10-05')], []);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ direction: 'long', qty: 1, entry: 100, exit: 140, exitDate: '2026-10-05', entryDate: '2026-10-01' });
    expect(closed[0].realised).toBeCloseTo((140 - 100) * 1 * 75, 10);
    expect(positions[0].qty).toBe(2);
    expect(positions[0].avg).toBe(100);
  });

  it('a full close removes the position', () => {
    const { positions, closed } = replayLedger([fill(PE, 'buy', 2, 80, '2026-10-01'), fill(PE, 'sell', 2, 60, '2026-10-02')], []);
    expect(positions).toHaveLength(0);
    expect(closed[0].realised).toBeCloseTo((60 - 80) * 2 * 75, 10);
  });

  it('short positions: realised sign is reversed and quantity is negative', () => {
    const { positions, closed } = replayLedger([fill(FUT, 'sell', 2, 24800, '2026-10-01'), fill(FUT, 'buy', 1, 24700, '2026-10-02')], []);
    expect(closed[0].direction).toBe('short');
    expect(closed[0].realised).toBeCloseTo((24700 - 24800) * 1 * 75 * -1, 10); // short gains when price falls
    expect(positions[0].qty).toBe(-1);
  });

  it('a larger opposite fill closes the position and flips the remainder at the fill price', () => {
    const { positions, closed } = replayLedger([fill(FUT, 'buy', 1, 100, '2026-10-01'), fill(FUT, 'sell', 3, 110, '2026-10-02')], []);
    expect(closed).toHaveLength(1);
    expect(closed[0].qty).toBe(1);
    expect(positions[0]).toMatchObject({ qty: -2, avg: 110, opened: '2026-10-02' });
  });

  it('realised P&L is not counted twice when the ledger is replayed', () => {
    const fills = [fill(CE, 'buy', 2, 100, '2026-10-01'), fill(CE, 'sell', 1, 150, '2026-10-02')];
    const first = replayLedger(fills, []);
    const second = replayLedger(fills, []);
    expect(realisedTotal(first.closed)).toBe(realisedTotal(second.closed));
    expect(realisedTotal(first.closed)).toBeCloseTo(50 * 75, 10);
  });
});

describe('unrealised P&L, notional and totals', () => {
  const book = replayLedger([fill(CE, 'buy', 2, 100, '2026-10-01'), fill(FUT, 'sell', 1, 24800, '2026-10-01')], []).positions;
  const priced = book.map(p => ({ ...p, cmp: p.kind === 'option' ? 130 : 24700 }));

  it('uses (cmp - avg) x signed lots x lot size', () => {
    expect(unrealised(priced[0])).toBeCloseTo((130 - 100) * 2 * 75, 10);
    expect(unrealised(priced[1])).toBeCloseTo((24700 - 24800) * -1 * 75, 10);
  });

  it('is zero without a price instead of NaN', () => {
    expect(unrealised(book[0])).toBe(0);
  });

  it('notional of an option is the strike value, not the premium; a future uses cmp or cost', () => {
    expect(notional(priced[0])).toBe(22600 * 2 * 75);
    expect(notional(priced[1])).toBe(24700 * 1 * 75);
    expect(notional(book[1])).toBe(24800 * 75);
  });

  it('total P&L reconciles to unrealised + realised', () => {
    const ledger = replayLedger([fill(CE, 'buy', 2, 100, '2026-10-01'), fill(CE, 'sell', 1, 150, '2026-10-02'), fill(FUT, 'buy', 1, 100, '2026-10-02')], []);
    const open = ledger.positions.map(p => ({ ...p, cmp: p.kind === 'option' ? 120 : 90 }));
    const total = unrealisedTotal(open) + realisedTotal(ledger.closed);
    expect(unrealisedTotal(open)).toBeCloseTo((120 - 100) * 1 * 75 + (90 - 100) * 75, 10);
    expect(total).toBeCloseTo((150 - 100) * 75 + (20 * 75) - 750, 10);
  });
});

describe('validation', () => {
  const ok = { qty: 1, price: 10, lot: 75, date: '2026-10-01' };
  it('accepts a valid fill', () => expect(validateFill(ok)).toBe(''));
  it('rejects non-positive quantity, price, missing lot, bad date', () => {
    expect(validateFill({ ...ok, qty: 0 })).toMatch(/Quantity/);
    expect(validateFill({ ...ok, price: -1 })).toMatch(/Price/);
    expect(validateFill({ ...ok, price: Number.NaN })).toMatch(/Price/);
    expect(validateFill({ ...ok, lot: 0 })).toMatch(/Lot/);
    expect(validateFill({ ...ok, date: '2026-02-30' })).toMatch(/date/);
  });
});

describe('dates (UTC)', () => {
  it('week starts on Monday and months/labels are stable', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12'); // Wednesday -> Monday
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday -> previous Monday
    expect(periodKey('2026-10-14', 'month')).toBe('2026-10');
    expect(periodLabel('2026-10', 'month')).toBe('Oct 2026');
    expect(periodLabel('2026-10-12', 'week')).toBe('12 Oct 2026 – 18 Oct 2026');
  });
  it('days to expiry is a whole-day difference without timezone drift', () => {
    expect(daysToExpiry('2026-10-29', '2026-10-22')).toBe(7);
    expect(daysToExpiry('2026-10-29', '2026-10-29')).toBe(0);
    expect(daysToExpiry('bad', '2026-10-29')).toBeNull();
  });
});

describe('closed-trade grouping and performance', () => {
  const trades = replayLedger([
    fill(CE, 'buy', 1, 100, '2026-10-01'), fill(CE, 'sell', 1, 160, '2026-10-05'),   // +4500 (Mon wk 10-05)
    fill(PE, 'buy', 1, 100, '2026-10-02'), fill(PE, 'sell', 1, 70, '2026-10-06'),     // -2250 (same week)
    fill(FUT, 'buy', 1, 100, '2026-10-02'), fill(FUT, 'sell', 1, 110, '2026-11-03'),  // +750 (Nov)
  ], []).closed;

  it('groups by day, week and month and sums within each', () => {
    expect(groupClosed(trades, 'day').map(g => g.realised).sort((a, b) => a - b)).toEqual([-2250, 750, 4500]);
    const weeks = groupClosed(trades, 'week');
    expect(weeks.find(g => g.key === '2026-10-05')).toMatchObject({ trades: 2, wins: 1, realised: 2250 });
    const months = groupClosed(trades, 'month');
    expect(months.find(g => g.key === '2026-10')?.realised).toBe(2250);
    expect(months.find(g => g.key === '2026-11')?.realised).toBe(750);
  });

  it('statistics: win rate, profit factor, expectancy, extremes', () => {
    const s = tradeStats(trades);
    expect(s).toMatchObject({ trades: 3, wins: 2, losses: 1, net: 3000, grossProfit: 5250, grossLoss: 2250, largestWin: 4500, largestLoss: -2250 });
    expect(s.winRate).toBeCloseTo(66.666, 2);
    expect(s.profitFactor).toBeCloseTo(5250 / 2250, 10);
    expect(s.expectancy).toBe(1000);
    expect(s.avgWin).toBe(2625);
    expect(s.avgLoss).toBe(2250);
  });

  it('profit factor is null with no losing trades; empty stats are zero, not NaN', () => {
    expect(tradeStats(trades.filter(t => t.realised > 0)).profitFactor).toBeNull();
    const empty = tradeStats([]);
    expect(empty.winRate).toBe(0);
    expect(empty.expectancy).toBe(0);
    expect(empty.dd.amount).toBe(0);
  });

  it('max drawdown is peak to trough on the cumulative curve', () => {
    const dd = maxDrawdown(trades);
    // cumulative: 4500, 2250, 3000 -> peak 4500, trough 2250
    expect(dd.amount).toBe(-2250);
    expect(dd.pct).toBeCloseTo(50, 10);
    expect(dd.peakDate).toBe('2026-10-05');
    expect(dd.troughDate).toBe('2026-10-06');
  });

  it('filters by inclusive exit-date range, with open-ended bounds', () => {
    expect(filterByExitDate(trades, '2026-10-06', '')).toHaveLength(2);
    expect(filterByExitDate(trades, '', '2026-10-05')).toHaveLength(1);
    expect(filterByExitDate(trades, '2026-10-05', '2026-10-06')).toHaveLength(2);
    expect(filterByExitDate(trades, '2027-01-01', '')).toHaveLength(0);
  });

  it('cumulative curve starts at zero and follows trade or period order', () => {
    expect(buildCurvePoints(trades, 'trade').map(p => p.v)).toEqual([0, 4500, 2250, 3000]);
    expect(buildCurvePoints(trades, 'month').map(p => p.v)).toEqual([0, 2250, 3000]);
    expect(periodPnlSeries(trades, 'month').map(b => b.v)).toEqual([2250, 750]);
  });

  it('chart geometry is finite and empty input yields no chart', () => {
    const curve = buildCurveChart(buildCurvePoints(trades, 'trade'), 'trade', false, trades.length)!;
    expect(curve.linePath).not.toMatch(/NaN/);
    expect(curve.peakPath).not.toMatch(/NaN/);
    const bars = buildBarChart(periodPnlSeries(trades, 'day'), false)!;
    expect(bars.bars.every(b => Number.isFinite(b.y) && Number.isFinite(b.height))).toBe(true);
    expect(bars.bars.filter(b => b.positive)).toHaveLength(2);
    expect(buildBarChart([], false)).toBeNull();
    // a single flat point must not divide by zero
    expect(buildBarChart([{ label: 'a', v: 0 }], false)!.bars[0].height).toBeGreaterThanOrEqual(1);
  });
});

describe('baskets', () => {
  const basket = { id: 'bk1', name: 'Spread' };
  const fills = [
    fill(CE, 'buy', 2, 100, '2026-10-01', 'bk1'),
    fill(PE, 'buy', 1, 90, '2026-10-01', 'bk1'),
    fill(PE, 'sell', 1, 100, '2026-10-03'),            // closes the basket's PE
    fill(FUT, 'buy', 1, 24800, '2026-10-02'),           // unassigned
  ];

  it('tags positions and the closed trades they produce', () => {
    const { positions, closed } = replayLedger(fills, [basket]);
    expect(positions.find(p => p.contract.key === CE.key)?.basketId).toBe('bk1');
    expect(positions.find(p => p.contract.key === FUT.key)?.basketId).toBeNull();
    expect(closed[0].basketId).toBe('bk1');
    expect(closed[0].realised).toBeCloseTo((100 - 90) * 75, 10);
  });

  it('deleting a basket keeps positions and trades, now unassigned', () => {
    const { positions, closed } = replayLedger(fills, []);
    expect(positions).toHaveLength(2);
    expect(positions.every(p => p.basketId === null)).toBe(true);
    expect(closed[0].basketId).toBeNull();
  });

  it('a later fill can move an open position into a basket', () => {
    const moved = replayLedger([fill(FUT, 'buy', 1, 100, '2026-10-01'), fill(FUT, 'buy', 1, 110, '2026-10-02', 'bk1')], [basket]);
    expect(moved.positions[0].basketId).toBe('bk1');
  });

  it('EOD series: replays fills day by day against real closes and reconciles to total P&L', () => {
    const prices = new Map([
      [CE.key, new Map([['2026-10-01', 105], ['2026-10-02', 110], ['2026-10-03', 120]])],
      [PE.key, new Map([['2026-10-01', 92], ['2026-10-02', 95]])],
    ]);
    const { rows, unpriced } = buildBasketEodSeries('bk1', fills, prices);
    expect(unpriced).toEqual([]);
    expect(rows.map(r => r.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    // day 1: CE 2 lots (105-100) x75x2 = 750 ; PE 1 lot (92-90) x75 = 150
    expect(rows[0].cum).toBeCloseTo(750 + 150, 8);
    // final: CE live (120-100)*2*75 = 3000 ; PE realised (100-90)*75 = 750
    expect(rows[2].cum).toBeCloseTo(3000 + 750, 8);
    expect(rows.reduce((s, r) => s + r.day, 0)).toBeCloseTo(rows[2].cum, 8);
    expect(rows[2].live).toBeGreaterThan(0);
    expect(rows[2].squared + rows[1].squared + rows[0].squared).toBeCloseTo(750, 8);
  });

  it('EOD series: contracts without EOD prices are reported and marked at fill price (no invented P&L)', () => {
    const { rows, unpriced } = buildBasketEodSeries('bk1', fills, new Map());
    expect(unpriced.length).toBeGreaterThan(0);
    expect(rows.at(-1)!.cum).toBeCloseTo(750, 8); // only the realised PE trade
  });

  it('EOD series: empty basket gives no rows', () => {
    expect(buildBasketEodSeries('missing', fills, new Map()).rows).toEqual([]);
  });
});
