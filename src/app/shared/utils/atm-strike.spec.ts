import { nearestStrike, sessionsOnOrBefore } from './atm-strike';

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
