import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './verify-otp.component.html',
  styleUrls: ['./verify-otp.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyOtpComponent { }
