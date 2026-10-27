import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';

import { DashboardLayoutComponent } from './layouts/dashboard-layout/dashboard-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';
import { DASHBOARD_TOOL_PATHS, HIDDEN_DASHBOARD_PATHS, RETIRED_PUBLIC_PATHS, routes } from './app.routes';

/** The one layout route that serves "/" (Home) and every top-level tool (/greeks, ...). */
export const dashboardLayout = (): Route => routes.find((route) => route.component === DashboardLayoutComponent)!;
export const dashboardTools = (): Route[] => dashboardLayout().children!;
/** Compatibility redirects for the old /dashboard/<tool> URLs. */
export const legacyDashboard = (): Route[] => dashboardTools().find((child) => child.path === 'dashboard')!.children!;

const allPaths = (): string[] => [
  ...routes.map((route) => route.path ?? ''),
  ...routes.flatMap((route) => (route.children ?? []).map((child) => `${route.path ?? ''}/${child.path ?? ''}`)),
];

describe('route table', () => {
  it('"/" is the existing dashboard Home inside the existing dashboard layout, not a redirect', () => {
    const layout = dashboardLayout();
    expect(layout.path).toBe('');
    const home = layout.children!.find((child) => child.path === '' && child.pathMatch === 'full')!;
    expect(home.redirectTo).toBeUndefined();
    expect(home.loadComponent).toBeDefined();
    expect(routes.some((route) => route.path === '' && route.redirectTo)).toBe(false);
  });

  it('/dashboard and /dashboard/home send people to "/"', () => {
    expect(legacyDashboard().find((child) => child.path === '')).toMatchObject({ redirectTo: '/', pathMatch: 'full' });
    expect(legacyDashboard().find((child) => child.path === 'home')).toMatchObject({ redirectTo: '/', pathMatch: 'full' });
  });

  it('retired landing pages redirect to "/" and no longer have a page', () => {
    expect([...RETIRED_PUBLIC_PATHS].sort()).toEqual(['about', 'blog', 'contact', 'data', 'faq', 'home', 'services']);
    for (const path of RETIRED_PUBLIC_PATHS) {
      const route = routes.find((candidate) => candidate.path === path)!;
      expect(route, path).toMatchObject({ redirectTo: '/', pathMatch: 'full' });
      expect(route.loadComponent).toBeUndefined();
      expect(route.component).toBeUndefined();
    }
    const publicLayout = routes.find((route) => route.component === PublicLayoutComponent)!;
    expect(publicLayout.children!.map((child) => child.path).sort()).toEqual(['disclaimer', 'privacy-policy', 'terms-conditions', 'termsconditions']);
    for (const path of RETIRED_PUBLIC_PATHS) expect(publicLayout.children!.map((child) => child.path)).not.toContain(path);
  });

  it('keeps login, register, terms, privacy and the disclaimer page', () => {
    const paths = allPaths();
    for (const expected of ['/login', '/register', '/privacy-policy', '/terms-conditions', '/termsconditions', '/disclaimer']) {
      expect(paths, expected).toContain(expected);
    }
    expect(routes.find((route) => route.path === 'termsconditions')).toBeUndefined();
  });

  it('serves the nine tools at the top level, each lazy-loaded once, and never under /dashboard', () => {
    expect([...DASHBOARD_TOOL_PATHS].sort()).toEqual(['eod', 'greeks', 'historical-volatility', 'implied-volatility', 'multi-leg-eod', 'options-chain', 'payoff', 'portfolio', 'probability']);
    for (const path of DASHBOARD_TOOL_PATHS) {
      const matches = dashboardTools().filter((child) => child.path === path);
      expect(matches, path).toHaveLength(1);
      expect(matches[0].loadComponent, path).toBeDefined();
      expect(legacyDashboard().find((child) => child.path === path), path).toMatchObject({ pathMatch: 'full' });
    }
  });

  it('has no top-level tool path that collides with a retired, public or auth path', () => {
    const others = routes.filter((route) => route.component !== DashboardLayoutComponent).flatMap((route) => [route.path ?? '', ...(route.children ?? []).map((child) => child.path ?? '')]);
    for (const path of DASHBOARD_TOOL_PATHS) expect(others, path).not.toContain(path);
  });

  it('hides Price Alerts and Blog & Reports: their URLs redirect to "/" and have no page', () => {
    expect([...HIDDEN_DASHBOARD_PATHS].sort()).toEqual(['blog-reports', 'price-alerts']);
    for (const path of HIDDEN_DASHBOARD_PATHS) {
      for (const child of [dashboardTools().find((candidate) => candidate.path === path)!, legacyDashboard().find((candidate) => candidate.path === path)!]) {
        expect(child, path).toMatchObject({ redirectTo: '/', pathMatch: 'full' });
        expect(child.loadComponent).toBeUndefined();
      }
    }
  });

  it('unknown URLs fall through to a not-found page without being redirected', () => {
    const last = routes[routes.length - 1];
    expect(last.path).toBe('**');
    expect(last.redirectTo).toBeUndefined();
    expect(last.loadComponent).toBeDefined();
  });
});

describe('navigation', () => {
  const navigate = async (url: string): Promise<string> => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  };

  it('"/" stays "/" and opens the dashboard Home', async () => {
    expect(await navigate('/')).toBe('/');
  });

  it.each(['/dashboard', '/dashboard/home'])('%s redirects to "/"', async (path) => {
    expect(await navigate(path)).toBe('/');
  });

  it.each(['/about', '/services', '/blog', '/contact', '/home', '/data', '/faq'])('%s redirects to "/"', async (path) => {
    expect(await navigate(path)).toBe('/');
  });

  it.each(['/price-alerts', '/blog-reports', '/dashboard/price-alerts', '/dashboard/blog-reports'])('%s redirects to "/"', async (path) => {
    expect(await navigate(path)).toBe('/');
  });

  it('renders the dashboard Home at "/" inside the dashboard layout, with no redirect', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    const harness = await RouterTestingHarness.create('/');
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const page = harness.fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/');
    expect(page.querySelector('app-sidebar')).toBeTruthy();
    expect(page.querySelector('app-dashboard-home .dh-title')?.textContent).toContain('Welcome to QuantSFC');
    const home = Array.from(page.querySelectorAll('a.nav-item')).find((a) => a.textContent?.trim() === 'Home');
    expect(home?.getAttribute('href')).toBe('/');
    expect(home?.classList.contains('active')).toBe(true);
  });

  it.each([['/disclaimer', 'app-public-layout'], ['/privacy-policy', 'app-public-layout'], ['/login', 'app-auth-layout'], ['/register', 'app-auth-layout'], ['/greeks', 'app-dashboard-layout'], ['/terms-conditions', 'app-public-layout'], ['/termsconditions', 'app-public-layout']])('%s renders in its own layout, not the dashboard Home', async (url, layout) => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    const harness = await RouterTestingHarness.create(url);
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const page = harness.fixture.nativeElement as HTMLElement;
    expect(page.querySelector(layout), layout).toBeTruthy();
    expect(page.querySelector('app-footer a[href="/disclaimer"]'), 'disclaimer footer').toBeTruthy();
    expect(page.querySelector('app-dashboard-home')).toBeNull();
  });

  it.each([...DASHBOARD_TOOL_PATHS])('/%s opens at its top-level URL (no redirect)', async (tool) => {
    expect(await navigate('/' + tool)).toBe('/' + tool);
  });

  it.each([...DASHBOARD_TOOL_PATHS])('old /dashboard/%s redirects to /%s', async (tool) => {
    expect(await navigate('/dashboard/' + tool)).toBe('/' + tool);
  });

  it('old /dashboard/closed-trades lands on /multi-leg-eod', async () => {
    expect(await navigate('/dashboard/closed-trades')).toBe('/multi-leg-eod');
  });

  it('keeps the query string when an old tool URL redirects', async () => {
    expect(await navigate('/dashboard/payoff?x=1')).toBe('/payoff?x=1');
  });

  it('/termsconditions renders the terms page at its own URL (no redirect)', async () => {
    expect(await navigate('/termsconditions')).toBe('/termsconditions');
  });

  it.each(['/privacy-policy', '/terms-conditions', '/termsconditions', '/disclaimer', '/login', '/register'])('%s stays where it is', async (path) => {
    expect(await navigate(path)).toBe(path);
  });

  it('keeps an unknown URL in the address bar (the server, not Angular, must set the 404 status)', async () => {
    expect(await navigate('/no-such-page')).toBe('/no-such-page');
  });
});
