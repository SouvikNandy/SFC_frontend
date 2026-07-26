import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-profile',
  standalone: true,
  template: '<section><h1>Profile</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileComponent {}
