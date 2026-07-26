import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-blog',
  standalone: true,
  template: '<section><h1>Blog</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogComponent {}
