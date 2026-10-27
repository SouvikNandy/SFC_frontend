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
    providers: [provideHttpClient(), provideRouter([{ path: ':screen', component: BlankComponent }])],
  }));

  it('sidebar shows Portfolio Analysis and Multi-Leg EOD Data (and no Closed Trades) with correct links', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.nav-item'));
    const byText = (text: string) => links.find(a => a.textContent?.trim() === text);
    expect(byText('Portfolio Analysis')?.getAttribute('href')).toBe('/portfolio');
    expect(byText('Multi-Leg EOD Data')?.getAttribute('href')).toBe('/multi-leg-eod');
    expect(byText('Closed Trades')).toBeUndefined();
    expect(byText('Portfolio')).toBeUndefined();
    expect(links.filter(a => a.textContent?.trim() === 'Multi-Leg EOD Data')).toHaveLength(1);
    expect(links.filter(a => a.textContent?.trim() === 'Portfolio Analysis')).toHaveLength(1);
  });

  it('does not list Price Alerts or Blog & Reports anywhere in the sidebar', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const hrefs = Array.from(root.querySelectorAll('a')).map(a => a.getAttribute('href') ?? '');
    expect(hrefs.some(href => href.includes('price-alerts') || href.includes('blog-reports'))).toBe(false);
    expect(root.textContent).not.toContain('Price Alerts');
    expect(root.textContent).not.toContain('Blog & Reports');
    expect(root.querySelector('.sfc-nav__heading')?.textContent).toBeTruthy();
    expect(Array.from(root.querySelectorAll('.sfc-nav__heading')).map(h => h.textContent?.trim())).toEqual(['Trading', 'Tools']);
  });

  it('topbar title follows the renamed screens', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(TopbarComponent);
    await router.navigateByUrl('/portfolio');
    fixture.detectChanges();
    expect(fixture.componentInstance.title).toBe('Portfolio Analysis');
    await router.navigateByUrl('/multi-leg-eod');
    expect(fixture.componentInstance.title).toBe('Multi-Leg EOD Data');
  });

  it('routes: portfolio and multi-leg-eod exist once; the old closed-trades URL redirects', () => {
    const children = routes.flatMap(route => route.children ?? []).filter(child => child.path !== 'dashboard');
    const count = (path: string) => children.filter(child => child.path === path).length;
    expect(count('portfolio')).toBe(1);
    expect(count('multi-leg-eod')).toBe(1);
    const legacy = routes.flatMap(route => route.children ?? []).find(child => child.path === 'dashboard')?.children ?? [];
    expect(legacy.find(child => child.path === 'closed-trades')).toMatchObject({ pathMatch: 'full' });
    expect(typeof legacy.find(child => child.path === 'closed-trades')?.redirectTo).toBe('function');
    expect(children.find(child => child.path === 'portfolio')?.redirectTo).toBeUndefined();
  });
});
