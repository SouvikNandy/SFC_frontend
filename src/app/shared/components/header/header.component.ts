import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="header__brand">
        <span class="header__brand-mark">
          <img src="assets/images/logo.png" alt="QuantSFC logo" />
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
        <a class="header__link" routerLink="/data" routerLinkActive="active">Data</a>
        <a class="header__link" routerLink="/tools" routerLinkActive="active">Tools</a>
        <a class="header__link header__login-btn" routerLink="/login" routerLinkActive="active">Log in</a>
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
        <a
          class="mobile-nav__link"
          routerLink="/data"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Data</a
        >

        <a
          class="mobile-nav__link"
          routerLink="/tools"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          >Tools</a
        >

        <a
          class="mobile-nav__link "
          routerLink="/login"
          routerLinkActive="active"
          (click)="toggleMobileNav()"
          ><span class="header__login-btn">Log in</span></a
        >

      </div>
    }
  `,
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  readonly mobileNavOpen = signal(false);

  toggleMobileNav(): void {
    this.mobileNavOpen.update((value) => !value);
  }
}
