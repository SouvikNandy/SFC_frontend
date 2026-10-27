import { describe, expect, it } from 'vitest';

import { formatDisplayDate } from './date-format';

describe('formatDisplayDate', () => {
  it('uses "Sep", never "Sept"', () => {
    expect(formatDisplayDate('2027-09-28')).toBe('28 Sep 2027');
  });

  it('formats every month with a three-letter name and a two-digit day', () => {
    const labels = Array.from({ length: 12 }, (_, i) => formatDisplayDate(`2026-${String(i + 1).padStart(2, '0')}-05`));
    expect(labels).toEqual([
      '05 Jan 2026', '05 Feb 2026', '05 Mar 2026', '05 Apr 2026', '05 May 2026', '05 Jun 2026',
      '05 Jul 2026', '05 Aug 2026', '05 Sep 2026', '05 Oct 2026', '05 Nov 2026', '05 Dec 2026',
    ]);
  });

  it('can omit the year and reads ISO datetimes by their date part', () => {
    expect(formatDisplayDate('2026-09-03', false)).toBe('03 Sep');
    expect(formatDisplayDate('2026-09-03T18:30:00.000Z')).toBe('03 Sep 2026');
  });

  it('accepts the last valid September day and leap-day dates', () => {
    expect(formatDisplayDate('2027-09-30')).toBe('30 Sep 2027');
    expect(formatDisplayDate('2028-02-29')).toBe('29 Feb 2028');
  });

  it('does not display impossible dates as valid', () => {
    for (const bad of ['2027-09-31', '2027-02-29', '2027-13-05', '2027-00-10', '2027-09-00', '2027-09-32']) {
      expect(formatDisplayDate(bad)).toBe(bad);
    }
  });

  it('returns unparseable input unchanged', () => {
    expect(formatDisplayDate('not a date')).toBe('not a date');
    expect(formatDisplayDate('')).toBe('');
  });
});
