import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: '<section><h1>Settings</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent {}
