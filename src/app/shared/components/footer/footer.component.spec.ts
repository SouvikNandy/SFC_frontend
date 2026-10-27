import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { DisclaimerComponent } from '../../../features/public/disclaimer/disclaimer.component';
import { AuthLayoutComponent } from '../../../layouts/auth-layout/auth-layout.component';
import { DashboardLayoutComponent } from '../../../layouts/dashboard-layout/dashboard-layout.component';
import { PublicLayoutComponent } from '../../../layouts/public-layout/public-layout.component';
import { DISCLAIMER_SUMMARY, DISCLAIMER_TRADING_LOSSES } from '../../legal/disclaimer';
import { FooterComponent } from './footer.component';

// The client's exact wording (developer change list, item 6), repeated here on purpose so an accidental edit fails.
const CLIENT_SUMMARY =
  'SFC Quant is a market-analytics platform for Indian equities. It is not investment advice, and we are not registered with SEBI as an investment adviser or research analyst. Backtests are hypothetical, and past performance does not predict future results.';
const CLIENT_LOSSES =
  '9 out of 10 individual traders in the equity Futures and Options segment incurred net losses. On average, loss makers registered a net trading loss close to 50,000. Over and above the net trading losses incurred, loss makers expended an additional 28% of net trading losses as transaction costs. Those making net trading profits incurred between 15% and 50% of such profits as transaction costs.';

const setup = () => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('disclaimer wording', () => {
  it('is the client wording, unchanged', () => {
    expect(DISCLAIMER_SUMMARY).toBe(CLIENT_SUMMARY);
    expect(DISCLAIMER_TRADING_LOSSES).toBe(CLIENT_LOSSES);
  });
});

describe('FooterComponent', () => {
  it('shows the disclaimer paragraph and a Disclaimer link to /disclaimer', () => {
    setup();
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(text(root.querySelector('.site-footer__text'))).toBe(`${CLIENT_SUMMARY} Disclaimer`);
    const link = root.querySelector('a')!;
    expect(link.textContent?.trim()).toBe('Disclaimer');
    expect(link.getAttribute('href')).toBe('/disclaimer');
  });
});

describe('/disclaimer page', () => {
  it('renders the complete text, including the trading-loss and transaction-cost disclosure', () => {
    setup();
    const fixture = TestBed.createComponent(DisclaimerComponent);
    fixture.detectChanges();
    const paragraphs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('p')).map((p) => text(p));
    expect(paragraphs).toEqual([CLIENT_SUMMARY, CLIENT_LOSSES]);
  });
});

describe('footer on every layout', () => {
  it.each([
    ['public', PublicLayoutComponent],
    ['dashboard', DashboardLayoutComponent],
    ['auth', AuthLayoutComponent],
  ] as const)('the %s layout shows the disclaimer footer with its link', (_name, layout) => {
    setup();
    const fixture = TestBed.createComponent(layout);
    fixture.detectChanges();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('app-footer');
    expect(footer).toBeTruthy();
    expect(text(footer)).toContain(CLIENT_SUMMARY);
    expect(footer!.querySelector('a')?.getAttribute('href')).toBe('/disclaimer');
  });
});
