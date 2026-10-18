import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from './core/services/toast.service';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the application shell: a router outlet and the global toast host (no starter heading)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('main.app-shell router-outlet')).toBeTruthy();
    expect(root.querySelector('app-toast')).toBeTruthy();
    expect(root.querySelector('h1')).toBeNull();
  });

  it('shows toast notifications raised anywhere in the app', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    TestBed.inject(ToastService).error('Something failed');
    fixture.detectChanges();
    const toast = (fixture.nativeElement as HTMLElement).querySelector('.toast');
    expect(toast?.textContent).toContain('Something failed');
    expect(toast?.classList.contains('toast--error')).toBe(true);
  });
});
