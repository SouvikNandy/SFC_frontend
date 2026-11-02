import { isNoStrikesResponse, readStrikes } from './expiry-strikes';

describe('readStrikes', () => {
  it('reads the backend\'s "stikes" key, ascending and unique', () => {
    expect(readStrikes({ stikes: [25300, 25100, 25200, 25100] })).toEqual([25100, 25200, 25300]);
  });

  it('also reads "strikes" and "strike", should the backend spelling be corrected', () => {
    expect(readStrikes({ strikes: [2, 1] })).toEqual([1, 2]);
    expect(readStrikes({ strike: [3, 1] })).toEqual([1, 3]);
  });

  it('drops values that are not usable strikes, and tolerates numeric strings', () => {
    expect(readStrikes({ stikes: [100, 'x', null, -5, 0, NaN, '200'] })).toEqual([100, 200]);
  });

  it('is empty for missing or malformed data', () => {
    expect(readStrikes(null)).toEqual([]);
    expect(readStrikes(undefined)).toEqual([]);
    expect(readStrikes({})).toEqual([]);
    expect(readStrikes({ stikes: 'nope' })).toEqual([]);
  });
});

describe('isNoStrikesResponse', () => {
  const err = (status: number, errors: unknown) => ({ status, error: { success: false, errors } });

  it('is true only for the 422 "No data available." on strike_price', () => {
    expect(isNoStrikesResponse(err(422, { strike_price: ['No data available.'] }))).toBe(true);
  });

  it('is false for other 422s and other statuses', () => {
    expect(isNoStrikesResponse(err(422, { expiry: ['This field is required.'] }))).toBe(false);
    expect(isNoStrikesResponse(err(422, { strike_price: ['Something else.'] }))).toBe(false);
    expect(isNoStrikesResponse(err(500, { strike_price: ['No data available.'] }))).toBe(false);
    expect(isNoStrikesResponse(null)).toBe(false);
  });
});
