import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly token = this.route.snapshot.queryParamMap.get('token') ?? 'demo-token';

  readonly form = new FormGroup({
    password: new FormControl('', [Validators.required, Validators.minLength(8), Validators.maxLength(32)]),
    confirmPassword: new FormControl('', [Validators.required])
  });

  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly isSuccess = signal(false);

  get passwordControl(): AbstractControl {
    return this.form.controls.password;
  }

  get confirmPasswordControl(): AbstractControl {
    return this.form.controls.confirmPassword;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, confirmPassword } = this.form.getRawValue();
    const passwordValue = password ?? '';
    const confirmPasswordValue = confirmPassword ?? '';

    if (passwordValue !== confirmPasswordValue) {
      this.confirmPasswordControl.setErrors({ mismatch: true });
      this.confirmPasswordControl.markAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService.resetPassword({ token: this.token, password: passwordValue }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.isSuccess.set(true);
        window.setTimeout(() => {
          this.router.navigateByUrl('/login');
        }, 1200);
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((value) => !value);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((value) => !value);
  }

  getPasswordErrorMessage(): string | null {
    if (this.passwordControl.hasError('required')) {
      return 'Password is required.';
    }

    if (this.passwordControl.hasError('minlength')) {
      return 'Password must be at least 8 characters long.';
    }

    if (this.passwordControl.hasError('maxlength')) {
      return 'Password must not exceed 32 characters.';
    }

    return null;
  }

  getConfirmPasswordErrorMessage(): string | null {
    if (this.confirmPasswordControl.hasError('required')) {
      return 'Please confirm your password.';
    }

    if (this.confirmPasswordControl.hasError('mismatch')) {
      return 'Passwords do not match.';
    }

    return null;
  }
}
