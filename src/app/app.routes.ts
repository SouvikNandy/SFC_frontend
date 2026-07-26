import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
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
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent)
      }
    ]
  },
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent)
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password.component').then((m) => m.ResetPasswordComponent)
      },
      {
        path: 'verify-otp',
        loadComponent: () => import('./features/auth/verify-otp/verify-otp.component').then((m) => m.VerifyOtpComponent)
      }
    ]
  },
  {
    path: 'dashboard',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard-home/dashboard-home.component').then((m) => m.DashboardHomeComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/dashboard/profile/profile.component').then((m) => m.ProfileComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/dashboard/settings/settings.component').then((m) => m.SettingsComponent)
      },
      {
        path: 'subscription',
        loadComponent: () => import('./features/dashboard/subscription/subscription.component').then((m) => m.SubscriptionComponent)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./features/dashboard/analytics/analytics.component').then((m) => m.AnalyticsComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/dashboard/reports/reports.component').then((m) => m.ReportsComponent)
      },
      {
        path: 'data',
        loadComponent: () => import('./features/dashboard/data/data.component').then((m) => m.DashboardDataComponent)
      },
      {
        path: 'tools',
        loadComponent: () => import('./features/dashboard/tools/tools.component').then((m) => m.DashboardToolsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
