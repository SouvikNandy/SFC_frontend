import { Routes } from '@angular/router';

import { authGuard, guestGuard, registrationGuard } from './core/guards/auth.guard';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { DashboardLayoutComponent } from './layouts/dashboard-layout/dashboard-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/public/home/home.component').then((m) => m.HomeComponent)
      },
      {
        path: 'about',
        loadComponent: () => import('./features/public/about/about.component').then((m) => m.AboutComponent)
      },
      {
        path: 'services',
        loadComponent: () => import('./features/public/services/services.component').then((m) => m.ServicesComponent)
      },
      {
        path: 'blog',
        loadComponent: () => import('./features/public/blog/blog.component').then((m) => m.BlogComponent)
      },
      {
        path: 'contact',
        loadComponent: () => import('./features/public/contact/contact.component').then((m) => m.ContactComponent)
      },
      {
        path: 'data',
        loadComponent: () => import('./features/public/data/data.component').then((m) => m.DataComponent)
      },
      {
        path: 'tools',
        loadComponent: () => import('./features/public/tools/tools.component').then((m) => m.ToolsComponent)
      },
      {
        path: 'privacy-policy',
        loadComponent: () => import('./features/public/privacy-policy/privacy-policy.component').then((m) => m.PrivacyPolicyComponent)
      },
      {
        path: 'terms-conditions',
        loadComponent: () => import('./features/public/terms-conditions/terms-conditions.component').then((m) => m.TermsConditionsComponent)
      },
      {
        path: 'faq',
        loadComponent: () => import('./features/public/faq/faq.component').then((m) => m.FaqComponent)
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
    path: 'dashboard',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', loadComponent: () => import('./features/dashboard/dashboard-home/dashboard-home.component').then((m) => m.DashboardHomeComponent) },
      { path: 'portfolio', loadComponent: () => import('./features/dashboard/portfolio/portfolio.component').then((m) => m.PortfolioComponent) },
      { path: 'options-chain', loadComponent: () => import('./features/dashboard/options-chain/option-chain.component').then((m) => m.OptionsChainComponent) },
      { path: 'eod', loadComponent: () => import('./features/dashboard/eod/eod.component').then((m) => m.EodComponent) },
      { path: 'closed-trades', loadComponent: () => import('./features/dashboard/closed-trades/closed-trades.component').then((m) => m.ClosedTradesComponent) },
      { path: 'greeks', loadComponent: () => import('./features/dashboard/greeks/greeks.component').then((m) => m.GreeksComponent) },
      { path: 'probability', loadComponent: () => import('./features/dashboard/probability/probability.component').then((m) => m.ProbabilityComponent) },
      { path: 'historical-volatility', loadComponent: () => import('./features/dashboard/historical-volatility/historical-volatility.component').then((m) => m.HistoricalVolatilityComponent) },
      { path: 'implied-volatility', loadComponent: () => import('./features/dashboard/implied-volatility/implied-volatility.component').then((m) => m.ImpliedVolatilityComponent) },
      { path: 'payoff', loadComponent: () => import('./features/dashboard/payoff/payoff.component').then((m) => m.PayoffComponent) },
      { path: 'blog-reports', loadComponent: () => import('./features/dashboard/blog-reports/blog-reports.component').then((m) => m.BlogReportsComponent) },
      { path: 'price-alerts', loadComponent: () => import('./features/dashboard/price-alerts/price-alerts.component').then((m) => m.PriceAlertsComponent) }
    ]
  },
  {
    path: '404',
    loadComponent: () => import('./features/public/not-found/not-found.component').then((m) => m.NotFoundComponent)
  },
  {
    path: '**',
    redirectTo: '404'
  }
];
