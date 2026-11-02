import { nearestStrike, sessionsOnOrBefore, isNoUnderlyingDataResponse } from './atm-strike';

describe('nearestStrike', () => {
  const strikes = [25000, 25050, 25100, 25150, 25200, 25250, 25300, 25350];
  it('picks the closest listed strike', () => {
    expect(nearestStrike(strikes, 25320.65)).toBe(25300);
    expect(nearestStrike(strikes, 25326)).toBe(25350);
  });
  it('a tie goes to the lower strike', () => {
    expect(nearestStrike(strikes, 25325)).toBe(25300);
  });
  it('a price outside the list clamps to the end strike', () => {
    expect(nearestStrike(strikes, 30000)).toBe(25350);
    expect(nearestStrike(strikes, 100)).toBe(25000);
  });
  it('works for any step size and unsorted input', () => {
    expect(nearestStrike([1400, 1380, 1390, 1410], 1395.4)).toBe(1400);
    expect(nearestStrike([59600, 58600, 60000], 59610.45)).toBe(59600);
  });
  it('is null without a usable price or strike list', () => {
    for (const price of [null, undefined, NaN, 0, -5, Infinity]) expect(nearestStrike(strikes, price as number)).toBeNull();
    expect(nearestStrike([], 100)).toBeNull();
    expect(nearestStrike(null, 100)).toBeNull();
  });
});

describe('sessionsOnOrBefore', () => {
  const sessions = ['2026-01-22', '2026-01-23', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-02-02'];
  it('a trading day returns itself first', () => {
    expect(sessionsOnOrBefore(sessions, '2026-01-30')[0]).toBe('2026-01-30');
  });
  it('a weekend falls back to the previous session', () => {
    expect(sessionsOnOrBefore(sessions, '2026-01-31')[0]).toBe('2026-01-30');
    expect(sessionsOnOrBefore(sessions, '2026-02-01')[0]).toBe('2026-01-30');
  });
  it('a holiday (26 Jan 2026) falls back to the previous session', () => {
    expect(sessionsOnOrBefore(sessions, '2026-01-26')[0]).toBe('2026-01-23');
  });
  it('is newest first, unique, and never later than the date asked for', () => {
    expect(sessionsOnOrBefore([...sessions, '2026-01-30'], '2026-01-28')).toEqual(['2026-01-28', '2026-01-27', '2026-01-23', '2026-01-22']);
  });
  it('no earlier session, bad date or no data gives an empty list', () => {
    expect(sessionsOnOrBefore(sessions, '2026-01-01')).toEqual([]);
    expect(sessionsOnOrBefore(sessions, 'bad')).toEqual([]);
    expect(sessionsOnOrBefore(null, '2026-01-30')).toEqual([]);
  });
});

describe('isNoUnderlyingDataResponse', () => {
  const err = (status: number, errors: unknown) => ({ status, error: { success: false, errors } });
  it('matches the 422 "No data available." the backend sends before its price history starts', () => {
    expect(isNoUnderlyingDataResponse(err(422, { underlying: ['No data available.'] }))).toBe(true);
  });
  it('matches the same answer under expiry_date (a date without a snapshot)', () => {
    expect(isNoUnderlyingDataResponse(err(422, { expiry_date: ['No data available.'] }))).toBe(true);
  });
  it('does not match other 422s, other statuses, network errors or missing bodies', () => {
    expect(isNoUnderlyingDataResponse(err(422, { trade_date: ['Date has wrong format.'] }))).toBe(false);
    expect(isNoUnderlyingDataResponse(err(422, { underlying: ['Something else.'] }))).toBe(false);
    expect(isNoUnderlyingDataResponse(err(422, { underlying: ['No data available.', 'Other.'] }))).toBe(false);
    expect(isNoUnderlyingDataResponse(err(500, { underlying: ['No data available.'] }))).toBe(false);
    expect(isNoUnderlyingDataResponse(err(0, null))).toBe(false);
    expect(isNoUnderlyingDataResponse({ status: 422 })).toBe(false);
    expect(isNoUnderlyingDataResponse(null)).toBe(false);
    expect(isNoUnderlyingDataResponse(new Error('boom'))).toBe(false);
  });
});
