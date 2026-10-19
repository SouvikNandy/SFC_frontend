import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="header" [class.header--shrunk]="shrunk()">
      <div class="header__brand">
        <span class="header__brand-mark">
          <img src="assets/images/logo.webp" alt="QuantSFC logo" width="240" height="160" />
        </span>
      </div>

      <nav class="header__nav" aria-label="Primary navigation">
        <a
          class="header__link"
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          >Home</a
        >
        <a class="header__link" routerLink="/about" routerLinkActive="active">About</a>
        <a class="header__link" routerLink="/services" routerLinkActive="active">Services</a>
        <a class="header__link" routerLink="/blog" routerLinkActive="active">Blog</a>
        <a class="header__link" routerLink="/contact" routerLinkActive="active">Contact</a>
        <!-- <a class="header__link" routerLink="/data" routerLinkActive="active">Data</a> -->
        <a class="header__link" routerLink="/dashboard/home" routerLinkActive="active">Dashboard</a>

        @if (!authService.isAuthenticated()) {
          <a class="header__link header__login-btn" routerLink="/login" routerLinkActive="active"
            >Log in</a
          >
        } @else {
          <a
            class="header__link header__login-btn"
            routerLink="/dashboard"
            routerLinkActive="active"
            >{{ getUserDisplayName() }}</a
          >
        }
      </nav>

      <button
        class="header__mobile-toggle"
        type="button"
        (click)="toggleMobileNav()"
        aria-label="Open navigation"
      >
        ☰
      </button>
    </header>

    @if (mobileNavOpen()) {
      <div class="mobile-nav" role="dialog" aria-label="Mobile navigation">
        <a
          class="mobile-nav__link"
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="toggleMobileNav()"
          >Home</a
        >
        <a
          class="mobile-nav__link"
          routerLink="/about"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >About</a
        >
        <a
          class="mobile-nav__link"
          routerLink="/services"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Services</a
        >
        <a
          class="mobile-nav__link"
          routerLink="/blog"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Blog</a
        >
        <!-- <a
          class="mobile-nav__link"
          routerLink="/data"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Data</a
        > -->

        <a
          class="mobile-nav__link"
          routerLink="/dashboard/home"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Dashboard</a
        >

        @if (!authService.isAuthenticated()) {
          <a
            class="mobile-nav__link"
            routerLink="/login"
            routerLinkActive="active"
            (click)="toggleMobileNav()"
            ><span class="header__login-btn">Log in</span></a
          >
        } @else {
          <a
            class="header__link header__login-btn"
            routerLink="/dashboard"
            routerLinkActive="active"
            >{{ getUserDisplayName() }}</a
          >
        }
      </div>
    }
  `,
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  /** The bar shrinks once the page is scrolled; the gap between the two thresholds stops it flickering as its height changes. */
  readonly shrunk = signal(false);

  @HostListener('window:scroll')
  onScroll(): void {
    const y = window.scrollY;
    if (!this.shrunk() && y > 60) this.shrunk.set(true);
    else if (this.shrunk() && y < 10) this.shrunk.set(false);
  }

  readonly authService = inject(AuthService);
  readonly mobileNavOpen = signal(false);

  toggleMobileNav(): void {
    this.mobileNavOpen.update((value) => !value);
  }

  getUserDisplayName(): string {
    const user = this.authService.currentUser();
    if (!user) return '';
    return `${user.first_name} ${user.last_name}`.trim();
  }
}
