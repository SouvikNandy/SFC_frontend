import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8), Validators.maxLength(32)])
  });

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly forgotPasswordMessage = signal<string | null>(null);

  get emailControl(): AbstractControl {
    return this.form.controls.email;
  }

  get passwordControl(): AbstractControl {
    return this.form.controls.password;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService.login().subscribe({
      next: () => {
        window.setTimeout(() => {
          this.isSubmitting.set(false);
          this.router.navigateByUrl('/dashboard');
        }, 450);
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }

  requestPasswordReset(): void {
    this.authService.forgotPassword().subscribe(() => {
      this.forgotPasswordMessage.set('Password reset link sent (demo)');
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  getEmailErrorMessage(): string | null {
    if (this.emailControl.hasError('required')) {
      return 'Enter the email linked to your account.';
    }

    if (this.emailControl.hasError('email')) {
      return 'Enter a valid email address.';
    }

    return null;
  }

  getPasswordErrorMessage(): string | null {
    if (this.passwordControl.hasError('required')) {
      return 'Enter your password.';
    }

    if (this.passwordControl.hasError('minlength')) {
      return 'Password must be at least 8 characters long.';
    }

    if (this.passwordControl.hasError('maxlength')) {
      return 'Password must not exceed 32 characters.';
    }

    return null;
  }
}
