import { cleanDates, defaultExpiry, selectExpiries } from './expiry-selection';

// The shape the backend returns: every expiry alive during the requested window, including later ones.
const JAN_2026 = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27', '2026-02-03', '2026-02-10', '2026-02-17', '2026-02-24', '2026-03-02', '2026-03-30', '2026-04-28', '2026-06-30'];

describe('selectExpiries', () => {
  it('Jan 2026: every listed expiry inside the range, weekly and monthly, ascending; nothing outside it', () => {
    expect(selectExpiries(JAN_2026, '2026-01-01', '2026-01-31')).toEqual(['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27']);
  });

  it('no expiry after To is added: no next-month or next-two-month monthlies', () => {
    const result = selectExpiries(JAN_2026, '2026-01-01', '2026-01-31');
    expect(result.every(date => date <= '2026-01-31')).toBe(true);
    expect(result).not.toContain('2026-02-24');
    expect(result).not.toContain('2026-03-30');
  });

  it('range limits are inclusive on both ends, and a day outside is excluded', () => {
    expect(selectExpiries(JAN_2026, '2026-01-13', '2026-01-20')).toEqual(['2026-01-13', '2026-01-20']);
    expect(selectExpiries(JAN_2026, '2026-01-14', '2026-01-19')).toEqual([]);
    expect(selectExpiries(JAN_2026, '2026-01-14', '2026-01-20')).toEqual(['2026-01-20']);
    expect(selectExpiries(JAN_2026, '2026-01-13', '2026-01-19')).toEqual(['2026-01-13']);
  });

  it('a single-day range returns that day only when it is an expiry', () => {
    expect(selectExpiries(JAN_2026, '2026-01-27', '2026-01-27')).toEqual(['2026-01-27']);
    expect(selectExpiries(JAN_2026, '2026-01-28', '2026-01-28')).toEqual([]);
  });

  it('weeklies and monthlies are both kept, with no classification: the last expiry of every month in a multi-month range is present with the weeklies', () => {
    const listed = ['2026-01-06', '2026-01-27', '2026-02-03', '2026-02-24', '2026-03-03', '2026-03-30'];
    expect(selectExpiries(listed, '2026-01-01', '2026-03-31')).toEqual(listed);
  });

  it('crosses a year end', () => {
    const listed = ['2025-12-23', '2025-12-30', '2026-01-06', '2026-01-27'];
    expect(selectExpiries(listed, '2025-12-29', '2026-01-06')).toEqual(['2025-12-30', '2026-01-06']);
  });

  it('removes duplicates (also those differing only by a time part) and sorts', () => {
    expect(selectExpiries(['2026-01-27', '2026-01-06', '2026-01-27T00:00:00', '2026-01-06'], '2026-01-01', '2026-01-31')).toEqual(['2026-01-06', '2026-01-27']);
  });

  it('far-future expiries the backend also returns are ignored', () => {
    expect(selectExpiries(['2026-01-27', '2026-06-30', '2027-12-28'], '2026-01-01', '2026-01-31')).toEqual(['2026-01-27']);
  });

  it('empty, missing and malformed input is safe', () => {
    expect(selectExpiries([], '2026-01-01', '2026-01-31')).toEqual([]);
    expect(selectExpiries(null, '2026-01-01', '2026-01-31')).toEqual([]);
    expect(selectExpiries(['x', '', '2026-13', 5, '2026-01-27T00:00:00'], '2026-01-01', '2026-01-31')).toEqual(['2026-01-27']);
    expect(selectExpiries(JAN_2026, '', '2026-01-31')).toEqual([]);
    expect(selectExpiries(JAN_2026, '2026-01-01', 'bad')).toEqual([]);
  });

  it('does not depend on the system date', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2031-05-05T00:00:00Z') });
    try {
      expect(selectExpiries(JAN_2026, '2026-01-01', '2026-01-31')).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('defaultExpiry', () => {
  it('is the most recent expiry inside the range', () => {
    expect(defaultExpiry(['2026-01-06', '2026-01-27', '2026-02-24'], '2026-01-01', '2026-01-31')).toBe('2026-01-27');
  });
  it('falls back to the earliest option when nothing falls inside the range', () => {
    expect(defaultExpiry(['2026-02-24', '2026-03-30'], '2026-01-01', '2026-01-31')).toBe('2026-02-24');
  });
  it('is undefined for an empty list', () => {
    expect(defaultExpiry([], '2026-01-01', '2026-01-31')).toBeUndefined();
  });
});

describe('cleanDates', () => {
  it('sorts, removes duplicates and drops invalid values', () => {
    expect(cleanDates(['2026-02-01', '2026-01-01', '2026-02-01', 'nope'])).toEqual(['2026-01-01', '2026-02-01']);
  });
});
