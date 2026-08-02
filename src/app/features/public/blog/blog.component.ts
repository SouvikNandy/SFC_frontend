import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="blog">
      <div class="blog__content">
        <h1 class="blog__title">Blog & Reports</h1>
        <p class="blog__subtitle">Daily F&O reports and analytics articles. Free to read, no account required.</p>
        
        <div class="blog__grid">
          <div class="blog__posts">
            @for (post of blogPosts; track post.id) {
              <div class="blog__post-card">
                <div class="blog__post-header">
                  <span class="blog__post-tag">{{ post.tag }}</span>
                  <span class="blog__post-date">{{ post.date }}</span>
                </div>
                <h2 class="blog__post-title">{{ post.title }}</h2>
                <p class="blog__post-excerpt">{{ post.excerpt }}</p>
                <button (click)="downloadReport(post.id)" class="blog__download-btn">
                  Download report
                </button>
              </div>
            }
          </div>

          <div class="blog__sidebar">
            <div class="blog__subscribe-card">
              <h3 class="blog__subscribe-title">Subscribe</h3>
              <p class="blog__subscribe-subtitle">Get the daily F&O report and new articles in your inbox — no account needed.</p>
              
              @if (isSubscribed()) {
                <div class="blog__subscribed-message">You're subscribed ✓</div>
              } @else {
                <form (ngSubmit)="subscribe()" class="blog__subscribe-form">
                  <input 
                    type="email" 
                    placeholder="you@example.com" 
                    required
                    [(ngModel)]="subscriberEmail"
                    name="email"
                    class="blog__subscribe-input"
                  />
                  <button type="submit" class="blog__subscribe-btn">Subscribe</button>
                </form>
              }
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./blog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogComponent {
  isSubscribed = signal(false);
  subscriberEmail = '';

  readonly blogPosts = [
    {
      id: 1,
      title: 'NIFTY F&O Daily Report — 18 Jul 2026',
      date: '18 Jul 2026',
      tag: 'Daily Report',
      excerpt: 'Call writers defended 24,800 through the session while put unwinding below 24,600 signalled fading downside conviction into the weekly expiry.'
    },
    {
      id: 2,
      title: 'Reading OI buildup: long vs short covering',
      date: '14 Jul 2026',
      tag: 'Article',
      excerpt: 'A practical framework for separating genuine directional buildup from short covering using price-OI-volume triangulation across strikes.'
    },
    {
      id: 3,
      title: 'BANKNIFTY F&O Daily Report — 17 Jul 2026',
      date: '17 Jul 2026',
      tag: 'Daily Report',
      excerpt: 'Banking majors dragged the index lower as FIIs trimmed index futures longs; IV compressed 40bps into the close on falling realised volatility.'
    },
    {
      id: 4,
      title: 'Volatility skew basics for Indian index options',
      date: '09 Jul 2026',
      tag: 'Article',
      excerpt: 'Why NIFTY puts habitually trade at a richer IV than equidistant calls, and how the skew shifts around events like RBI policy and results season.'
    }
  ];

  downloadReport(id: number): void {
    // TODO: Replace with actual API call when backend is ready
    console.log('Downloading report:', id);
    alert(`Report ${id} downloaded`);
  }

  subscribe(): void {
    if (this.subscriberEmail) {
      // TODO: Replace with actual API call when backend is ready
      console.log('Subscribed:', this.subscriberEmail);
      this.isSubscribed.set(true);
      this.subscriberEmail = '';
    }
  }
}

