import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthLayoutComponent } from '../../../layouts/auth-layout/auth-layout.component';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  it('offers tool links under "Popular pages" and none to the retired landing pages', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.not-found__links a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/dashboard/options-chain',
      '/dashboard/greeks',
      '/dashboard/implied-volatility',
      '/dashboard/payoff',
      '/dashboard/eod',
    ]);
    for (const retired of ['/about', '/services', '/blog', '/contact']) expect(hrefs).not.toContain(retired);
  });
});

describe('"live" wording', () => {
  it('is gone from the Login/Register shell', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AuthLayoutComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/\blive\b/i);
    expect(text).toContain('Daily options chain');
  });
});
