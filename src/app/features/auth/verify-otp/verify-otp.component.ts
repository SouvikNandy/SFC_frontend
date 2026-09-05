import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { DEFAULT_OTP } from '../../../core/models/auth.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './verify-otp.component.html',
  styleUrls: ['./verify-otp.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyOtpComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly registrationContext = this.authService.getRegistrationContext();
  readonly registerEmail = this.registrationContext?.email ?? 'your email';
  readonly registeredPhone = this.registrationContext?.phone ?? 'your phone';

  readonly form = new FormGroup({
    otp: new FormControl('', [Validators.required, Validators.pattern(/^\d{4}$/)])
  });

  readonly isSubmitting = signal(false);
  readonly isSuccess = signal(false);
  readonly otpError = signal<string | null>(null);

  get otpControl(): AbstractControl {
    return this.form.controls.otp;
  }

  normalizeOtp(value: string): void {
    this.otpControl.setValue(value.replace(/\D/g, '').slice(0, 4));
  }

  verifyOtp(): void {
    if (!this.registrationContext) {
      this.router.navigateByUrl('/register');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.otpError.set('Enter the 4-digit verification code.');
      return;
    }

    const otp = this.otpControl.value ?? '';

    if (otp !== DEFAULT_OTP) {
      this.form.markAllAsTouched();
      this.otpError.set('Enter the correct 4-digit verification code.');
      return;
    }

    this.isSubmitting.set(true);
    this.otpError.set(null);

    this.authService.verifyOtp({ phone: this.registeredPhone, otp }).subscribe({
      next: () => { this.isSubmitting.set(false); this.isSuccess.set(true); void this.router.navigateByUrl(this.authService.isAuthenticated() ? '/dashboard' : '/login'); },
      error: () => { this.isSubmitting.set(false); this.otpError.set('Unable to verify the OTP. Please try again.'); this.toast.error('Unable to verify the OTP. Please try again.'); }
    });
  }

  resendCode(): void {
    this.otpError.set(null);
  }
}
