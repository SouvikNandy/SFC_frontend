import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOAST_DURATION_MS, ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  const shown = () => service.messages().map(toast => [toast.type, toast.message]);

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ToastService();
  });

  afterEach(() => vi.useRealTimers());

  it('offers success, info and error variants', () => {
    service.success('Saved');
    service.info('Expiry replaced');
    service.error('Unable to load');
    expect(shown()).toEqual([['success', 'Saved'], ['info', 'Expiry replaced'], ['error', 'Unable to load']]);
  });

  it('dismisses success and info after 3.5 s and errors after 7 s', () => {
    expect(TOAST_DURATION_MS).toEqual({ success: 3500, info: 3500, error: 7000 });
    service.success('Saved');
    service.info('Note');
    service.error('Failed');
    vi.advanceTimersByTime(3499);
    expect(shown()).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([['error', 'Failed']]);
    vi.advanceTimersByTime(3499);
    expect(shown()).toEqual([['error', 'Failed']]);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it('can be dismissed by hand before its time', () => {
    service.error('Failed');
    service.dismiss(service.messages()[0].id);
    expect(shown()).toEqual([]);
    vi.advanceTimersByTime(7000);   // the pending timer finds nothing left to remove
    expect(shown()).toEqual([]);
  });

  it('does not show the same toast twice while it is visible', () => {
    service.error('Unable to load the strikes');
    service.error('Unable to load the strikes');
    service.info('Unable to load the strikes');           // another type is another notification
    service.error('Unable to load the expiries');
    expect(shown()).toEqual([['error', 'Unable to load the strikes'], ['info', 'Unable to load the strikes'], ['error', 'Unable to load the expiries']]);
  });

  it('shows it again once the earlier one has gone', () => {
    service.info('Expiry replaced');
    vi.advanceTimersByTime(TOAST_DURATION_MS.info);
    service.info('Expiry replaced');
    expect(shown()).toEqual([['info', 'Expiry replaced']]);
  });
});
