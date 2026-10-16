import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../../app.routes';
import { SidebarComponent } from './sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

@Component({ standalone: true, template: '' })
class BlankComponent {}

describe('dashboard navigation', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideRouter([{ path: 'dashboard/:screen', component: BlankComponent }])],
  }));

  it('sidebar shows Portfolio Analysis and Multi-Leg EOD Data (and no Closed Trades) with correct links', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.nav-item'));
    const byText = (text: string) => links.find(a => a.textContent?.trim() === text);
    expect(byText('Portfolio Analysis')?.getAttribute('href')).toBe('/dashboard/portfolio');
    expect(byText('Multi-Leg EOD Data')?.getAttribute('href')).toBe('/dashboard/multi-leg-eod');
    expect(byText('Closed Trades')).toBeUndefined();
    expect(byText('Portfolio')).toBeUndefined();
    expect(links.filter(a => a.textContent?.trim() === 'Multi-Leg EOD Data')).toHaveLength(1);
    expect(links.filter(a => a.textContent?.trim() === 'Portfolio Analysis')).toHaveLength(1);
  });

  it('topbar title follows the renamed screens', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(TopbarComponent);
    await router.navigateByUrl('/dashboard/portfolio');
    fixture.detectChanges();
    expect(fixture.componentInstance.title).toBe('Portfolio Analysis');
    await router.navigateByUrl('/dashboard/multi-leg-eod');
    expect(fixture.componentInstance.title).toBe('Multi-Leg EOD Data');
  });

  it('routes: portfolio and multi-leg-eod exist once; the old closed-trades URL redirects', () => {
    const dashboard = routes.find(route => route.path === 'dashboard')!;
    const children = dashboard.children ?? [];
    const count = (path: string) => children.filter(child => child.path === path).length;
    expect(count('portfolio')).toBe(1);
    expect(count('multi-leg-eod')).toBe(1);
    expect(children.find(child => child.path === 'closed-trades')).toMatchObject({ redirectTo: 'multi-leg-eod' });
    expect(children.find(child => child.path === 'portfolio')?.redirectTo).toBeUndefined();
  });
});
