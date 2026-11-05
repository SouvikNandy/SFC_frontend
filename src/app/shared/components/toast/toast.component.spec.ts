import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../../core/services/toast.service';
import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  let host: HTMLElement;
  let service: ToastService;
  let fixture: ReturnType<typeof TestBed.createComponent<ToastComponent>>;
  const toasts = () => Array.from(host.querySelectorAll<HTMLElement>('.toast'));

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(ToastComponent);
    host = fixture.nativeElement as HTMLElement;
    service = TestBed.inject(ToastService);
  });

  afterEach(() => vi.useRealTimers());

  it('announces an error as an alert and success and info as a status', () => {
    service.error('Unable to load');
    service.success('Exported');
    service.info('Expiry replaced');
    fixture.detectChanges();
    expect(toasts().map(t => [t.getAttribute('role'), t.textContent?.replace('×', '').trim()])).toEqual([
      ['alert', 'Unable to load'],
      ['status', 'Exported'],
      ['status', 'Expiry replaced'],
    ]);
    expect(toasts().every(t => t.getAttribute('aria-atomic') === 'true')).toBe(true);
    expect(host.querySelector('.toast-stack')?.hasAttribute('aria-live')).toBe(false);   // no second live region around the toasts
  });

  it('styles each variant by its own class', () => {
    service.error('a');
    service.success('b');
    service.info('c');
    fixture.detectChanges();
    expect(toasts().map(t => ['toast--error', 'toast--success', 'toast--info'].filter(c => t.classList.contains(c)))).toEqual([['toast--error'], ['toast--success'], ['toast--info']]);
  });

  it('every toast has a labelled dismiss button that removes it', () => {
    service.error('Unable to load');
    fixture.detectChanges();
    const button = host.querySelector<HTMLButtonElement>('.toast button')!;
    expect(button.getAttribute('aria-label')).toBe('Dismiss notification');
    button.click();
    fixture.detectChanges();
    expect(toasts()).toHaveLength(0);
  });
});
