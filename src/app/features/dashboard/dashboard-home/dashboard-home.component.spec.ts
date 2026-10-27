import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DashboardHomeComponent } from './dashboard-home.component';
import { HomeService } from './home.service';

describe('DashboardHomeComponent greeting', () => {
  const isAuthenticated = signal(false);
  const currentUser = signal<{ first_name?: string; last_name?: string; email?: string } | null>(null);

  beforeEach(() => {
    isAuthenticated.set(false);
    currentUser.set(null);
    TestBed.configureTestingModule({
      imports: [DashboardHomeComponent],
      providers: [
        { provide: AuthService, useValue: { isAuthenticated, currentUser } },
        { provide: HomeService, useValue: { getMarketSummary: () => of([]), getQuickLinks: () => of([]) } },
        { provide: ToastService, useValue: { error: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
  });

  const title = () => {
    const fixture = TestBed.createComponent(DashboardHomeComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.dh-title')?.textContent?.trim();
  };

  it('greets guests with "Welcome to QuantSFC"', () => {
    expect(title()).toBe('Welcome to QuantSFC');
  });

  it('has no "live" wording on the page and does not route to the hidden alerts page', () => {
    const fixture = TestBed.createComponent(DashboardHomeComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toMatch(/\blive\b/i);
    const navigate = TestBed.inject(Router).navigateByUrl as ReturnType<typeof vi.fn>;
    fixture.componentInstance.go('alerts');
    expect(navigate).toHaveBeenLastCalledWith('/');
  });

  it('shows each index with its price, signed change, direction and the session date', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardHomeComponent],
      providers: [
        { provide: AuthService, useValue: { isAuthenticated, currentUser } },
        { provide: HomeService, useValue: {
          getMarketSummary: () => of([
            { symbol: 'NIFTY', value: '22,753.20', change: '+153.20 (+0.68%)', up: true, direction: 'up', asOf: '26 Oct 2026' },
            { symbol: 'FINNIFTY', value: '24,300.00', change: '-51.35 (-0.21%)', up: false, direction: 'down', asOf: '26 Oct 2026' },
            { symbol: 'NIFTYFPI', value: '1,457.25', change: '0.00 (0.00%)', up: false, direction: 'flat', asOf: '' },
          ]),
          getQuickLinks: () => of([]),
        } },
        { provide: ToastService, useValue: { error: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(DashboardHomeComponent);
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.summary-card')).filter((card) => card.querySelector('.summary-card__symbol'));
    const pnl = (index: number) => cards[index].querySelector('.summary-card__pnl')!;
    expect(pnl(0).classList.contains('pnl-positive')).toBe(true);
    expect(pnl(1).classList.contains('pnl-negative')).toBe(true);
    expect(pnl(1).textContent).toContain('-51.35');
    expect(pnl(2).classList.contains('pnl-positive') || pnl(2).classList.contains('pnl-negative')).toBe(false);
    expect(cards[0].querySelector('.summary-card__asof')?.textContent?.trim()).toBe('as of 26 Oct 2026');
    expect(cards[2].querySelector('.summary-card__asof')).toBeNull();
  });

  it('keeps "Welcome back, <name>" for signed-in users', () => {
    isAuthenticated.set(true);
    currentUser.set({ first_name: 'Anjali', last_name: 'Mehta' });
    expect(title()).toBe('Welcome back, Anjali Mehta');
  });
});
