import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
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
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly registerEmail = this.route.snapshot.queryParamMap.get('email') ?? 'your email';
  readonly registeredPhone = this.route.snapshot.queryParamMap.get('phone') ?? 'your phone';

  readonly form = new FormGroup({
    emailOtp: new FormControl('', [Validators.required, Validators.pattern(/^\d{6}$/)]),
    phoneOtp: new FormControl('', [Validators.required, Validators.pattern(/^\d{6}$/)])
  });

  readonly isSubmitting = signal(false);
  readonly isSuccess = signal(false);
  readonly otpError = signal<string | null>(null);

  get emailOtpControl(): AbstractControl {
    return this.form.controls.emailOtp;
  }

  get phoneOtpControl(): AbstractControl {
    return this.form.controls.phoneOtp;
  }

  normalizeOtp(controlName: 'emailOtp' | 'phoneOtp', value: string): void {
    const nextValue = value.replace(/\D/g, '').slice(0, 6);
    this.form.controls[controlName].setValue(nextValue);
  }

  verifyOtp(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.otpError.set('Both OTP codes must be exactly 6 digits.');
      return;
    }

    const emailOtp = this.emailOtpControl.value ?? '';
    const phoneOtp = this.phoneOtpControl.value ?? '';

    if (emailOtp.length !== 6 || phoneOtp.length !== 6) {
      this.form.markAllAsTouched();
      this.otpError.set('Both OTP codes must be exactly 6 digits.');
      return;
    }

    this.isSubmitting.set(true);
    this.otpError.set(null);

    this.authService.verifyOtp({
      phone: this.registeredPhone,
      otp: phoneOtp
    }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.isSuccess.set(true);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.otpError.set('Unable to verify the OTP. Please try again.');
        this.toast.error('Unable to verify the OTP. Please try again.');
      }
    });
  }

  resendCode(): void {
    this.otpError.set(null);
  }
}
