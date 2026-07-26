import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  template: '<section><h1>Verify OTP</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyOtpComponent {}
