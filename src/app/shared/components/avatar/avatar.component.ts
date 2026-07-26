import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <div class="avatar" [class.avatar--sm]="size() === 'sm'" [class.avatar--lg]="size() === 'lg'">
      @if (initials()) {
        <span class="avatar__initials">{{ initials() }}</span>
      } @else {
        <span class="avatar__fallback">?</span>
      }
    </div>
  `,
  styleUrls: ['./avatar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvatarComponent {
  initials = input<string>('');
  size = input<'sm' | 'md' | 'lg'>('md');
}
