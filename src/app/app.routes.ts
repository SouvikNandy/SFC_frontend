import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import { guestGuard, registrationGuard } from './core/guards/auth.guard';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { DashboardLayoutComponent } from './layouts/dashboard-layout/dashboard-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';

/*
 * Browser-side routing only. The real HTTP status codes (301 for the retired paths, 404 for unknown URLs) must come
 * from the web server; see docs/deployment-routing.md, which lists the same paths.
 */

/** Public landing pages that no longer exist; each redirects to the dashboard at "/". */
export const RETIRED_PUBLIC_PATHS = ['home', 'about', 'services', 'blog', 'contact', 'data', 'faq'] as const;

/** Dashboard tools, served at the top level ("/greeks"); the old "/dashboard/<tool>" URLs redirect to them. */
export const DASHBOARD_TOOL_PATHS = ['portfolio', 'options-chain', 'eod', 'multi-leg-eod', 'greeks', 'probability', 'historical-volatility', 'implied-volatility', 'payoff'] as const;

/** Dashboard placeholders hidden until further notice; direct URLs redirect to "/". */
export const HIDDEN_DASHBOARD_PATHS = ['blog-reports', 'price-alerts'] as const;

/** Redirect to a top-level path, keeping the query string (a plain absolute redirectTo drops it). */
const redirectKeepingQuery = (target: string) => ({ queryParams }: { queryParams: Record<string, string> }) =>
  inject(Router).createUrlTree([target], { queryParams });

export const routes: Routes = [
  ...RETIRED_PUBLIC_PATHS.map((path) => ({ path, pathMatch: 'full' as const, redirectTo: '/' })),
  // Must come before the other empty-path layouts: an empty-path parent also matches "/" even when none of its children do.
  {
    // One dashboard layout serves "/" (Home) and every tool (top-level paths), so moving between them keeps the sidebar and ticker.
    path: '',
    component: DashboardLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/dashboard/dashboard-home/dashboard-home.component').then((m) => m.DashboardHomeComponent) },
      { path: 'portfolio', loadComponent: () => import('./features/dashboard/portfolio/portfolio.component').then((m) => m.PortfolioComponent) },
      { path: 'options-chain', loadComponent: () => import('./features/dashboard/options-chain/options-chain.component').then((m) => m.OptionsChainComponent) },
      { path: 'eod', loadComponent: () => import('./features/dashboard/eod/eod.component').then((m) => m.EodComponent) },
      { path: 'multi-leg-eod', loadComponent: () => import('./features/dashboard/multi-leg-eod/multi-leg-eod.component').then((m) => m.MultiLegEodComponent) },
      { path: 'greeks', loadComponent: () => import('./features/dashboard/greeks/greeks.component').then((m) => m.GreeksComponent) },
      { path: 'probability', loadComponent: () => import('./features/dashboard/probability/probability.component').then((m) => m.ProbabilityComponent) },
      { path: 'historical-volatility', loadComponent: () => import('./features/dashboard/historical-volatility/historical-volatility.component').then((m) => m.HistoricalVolatilityComponent) },
      { path: 'implied-volatility', loadComponent: () => import('./features/dashboard/implied-volatility/implied-volatility.component').then((m) => m.ImpliedVolatilityComponent) },
      { path: 'payoff', loadComponent: () => import('./features/dashboard/payoff/payoff.component').then((m) => m.PayoffComponent) },
      // Hidden placeholder pages: no menu entry, and direct URLs go to the dashboard.
      ...HIDDEN_DASHBOARD_PATHS.map((path) => ({ path, pathMatch: 'full' as const, redirectTo: '/' })),
      {
        // Compatibility: tools used to live under /dashboard/<tool>. Home lives at "/".
        path: 'dashboard',
        children: [
          { path: '', redirectTo: '/', pathMatch: 'full' },
          { path: 'home', redirectTo: '/', pathMatch: 'full' },
          ...DASHBOARD_TOOL_PATHS.map((path) => ({ path, pathMatch: 'full' as const, redirectTo: redirectKeepingQuery('/' + path) })),
          // The screen formerly named Closed Trades is now Multi-Leg EOD Data; keep old links working.
          { path: 'closed-trades', redirectTo: redirectKeepingQuery('/multi-leg-eod'), pathMatch: 'full' },
          ...HIDDEN_DASHBOARD_PATHS.map((path) => ({ path, pathMatch: 'full' as const, redirectTo: '/' }))
        ]
      }
    ]
  },
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      {
        path: 'privacy-policy',
        loadComponent: () => import('./features/public/privacy-policy/privacy-policy.component').then((m) => m.PrivacyPolicyComponent)
      },
      {
        path: 'terms-conditions',
        loadComponent: () => import('./features/public/terms-conditions/terms-conditions.component').then((m) => m.TermsConditionsComponent)
      },
      {
        // The client's spelling must stay reachable (HTTP 200), so it renders the same page instead of redirecting.
        path: 'termsconditions',
        loadComponent: () => import('./features/public/terms-conditions/terms-conditions.component').then((m) => m.TermsConditionsComponent)
      },
      {
        path: 'disclaimer',
        loadComponent: () => import('./features/public/disclaimer/disclaimer.component').then((m) => m.DisclaimerComponent)
      }
    ]
  },
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'login',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent)
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/register/register.component').then((m) => m.RegisterComponent)
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
      },
      {
        path: 'verify-otp',
        canActivate: [registrationGuard],
        loadComponent: () => import('./features/auth/verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent)
      },
      {
        path: 'verify-email-success',
        canActivate: [registrationGuard],
        loadComponent: () => import('./features/auth/verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent)
      },
      {
        path: 'invalid-reset-link',
        loadComponent: () => import('./features/auth/reset-password/invalid-reset-link/invalid-reset-link.component').then((m) => m.InvalidResetLinkComponent)
      }
    ]
  },
  {
    path: '404',
    loadComponent: () => import('./features/public/not-found/not-found.component').then((m) => m.NotFoundComponent)
  },
  {
    // Unknown URLs render the not-found page in place. The browser cannot set an HTTP status; the server must (see docs).
    path: '**',
    loadComponent: () => import('./features/public/not-found/not-found.component').then((m) => m.NotFoundComponent)
  }
];
