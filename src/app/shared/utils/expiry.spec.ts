import { afterEach, describe, expect, it } from 'vitest';

import { daysToExpiry, expiryNote, istToday } from './expiry';

describe('istToday', () => {
  it('rolls over to the next day at 00:00 IST (18:30 UTC)', () => {
    expect(istToday(new Date('2026-10-23T18:29:59Z'))).toBe('2026-10-23');
    expect(istToday(new Date('2026-10-23T18:30:00Z'))).toBe('2026-10-24');
  });

  it('is independent of the instant’s UTC date', () => {
    expect(istToday(new Date('2026-10-21T00:00:00Z'))).toBe('2026-10-21'); // 05:30 IST
    expect(istToday(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01'); // 01:30 IST next year
  });
});

describe('browser timezone independence', () => {
  // Node's process is not in this project's type definitions; it exists at runtime under the test runner.
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const original = env['TZ'];
  afterEach(() => {
    if (original === undefined) delete env['TZ'];
    else env['TZ'] = original;
  });

  it('gives the same IST date and day count under very different system timezones', () => {
    const instant = new Date('2026-10-23T18:45:00Z'); // 00:15 IST on 24 Oct
    const results = ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata'].map((tz) => {
      env['TZ'] = tz;
      return [istToday(instant), daysToExpiry('2026-10-27', istToday(instant))];
    });
    for (const result of results) expect(result).toEqual(['2026-10-24', 3]);
  });
});

describe('daysToExpiry', () => {
  it('21 Oct to 27 Oct is 6 calendar days (the client’s example)', () => {
    expect(daysToExpiry('2026-10-27', '2026-10-21')).toBe(6);
  });

  it('counts across month and year ends and leap days', () => {
    expect(daysToExpiry('2026-11-03', '2026-10-27')).toBe(7);
    expect(daysToExpiry('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysToExpiry('2028-03-01', '2028-02-28')).toBe(2);
  });

  it('is exact across daylight-saving changes (pure calendar arithmetic)', () => {
    expect(daysToExpiry('2026-03-30', '2026-03-28')).toBe(2); // US/EU clock change weekend
    expect(daysToExpiry('2026-11-02', '2026-10-31')).toBe(2);
  });

  it('is 0 on expiry day, negative after it and NaN for invalid dates', () => {
    expect(daysToExpiry('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysToExpiry('2026-10-20', '2026-10-21')).toBe(-1);
    expect(daysToExpiry('2026-02-31', '2026-10-21')).toBeNaN();
    expect(daysToExpiry('nope', '2026-10-21')).toBeNaN();
  });

  it('defaults the valuation date to today in IST', () => {
    expect(daysToExpiry(istToday())).toBe(0);
  });
});

describe('expiryNote', () => {
  it('shows the expiry, the unclamped DTE and the valuation date, with "Sep"', () => {
    expect(expiryNote('2027-09-28', '2027-09-22')).toBe('Expiry 28 Sep 2027 · 6 days to expiry · Valuation date 22 Sep 2027');
    expect(expiryNote('2026-10-21', '2026-10-21')).toBe('Expiry 21 Oct 2026 · 0 days to expiry · Valuation date 21 Oct 2026');
    expect(expiryNote('2026-10-22', '2026-10-21')).toContain('1 day to expiry');
  });

  it('falls back to the valuation date alone when there is no valid expiry', () => {
    expect(expiryNote(null, '2026-10-21')).toBe('Valuation date 21 Oct 2026');
    expect(expiryNote('bad', '2026-10-21')).toBe('Valuation date 21 Oct 2026');
  });
});
