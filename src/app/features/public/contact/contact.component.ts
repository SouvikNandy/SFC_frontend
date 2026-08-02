import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="contact">
      <section class="contact__hero" aria-labelledby="contact-hero-title">
        <div class="contact__hero-content">
          <span class="contact__eyebrow">Get in touch</span>
          <h1 id="contact-hero-title" class="contact__hero-title">Contact Us</h1>
          <p class="contact__hero-subtitle">Questions about training, consulting or the platform? Tell us a little about what you need and we will get back to you.</p>
        </div>
      </section>

      <div class="contact__content">
        <div class="contact__grid">
          <div class="contact__form-wrapper">
            <div class="contact__form-header">
              <div class="contact__divider"></div>
              <span class="contact__section-label">Send a message</span>
            </div>
            <form (ngSubmit)="submitContact()" class="contact__form">
              <div class="contact__form-row">
                <div class="contact__form-group">
                  <label for="name" class="contact__label">Name</label>
                  <input 
                    id="name" 
                    type="text" 
                    placeholder="Your name" 
                    required
                    [(ngModel)]="name"
                    name="name"
                    class="contact__input"
                  />
                </div>
                <div class="contact__form-group">
                  <label for="email" class="contact__label">Email</label>
                  <input 
                    id="email" 
                    type="email" 
                    placeholder="you@example.com" 
                    required
                    [(ngModel)]="email"
                    name="email"
                    class="contact__input"
                  />
                </div>
              </div>
              <div class="contact__form-group">
                <label for="message" class="contact__label">Message</label>
                <textarea 
                  id="message"
                  rows="5"
                  placeholder="How can we help?"
                  required
                  [(ngModel)]="message"
                  name="message"
                  class="contact__input contact__textarea"
                ></textarea>
              </div>
              <button type="submit" class="contact__submit">Send message</button>
            </form>
          </div>

          <div class="contact__sidebar">
            <div class="contact__info-card contact__info-card--hero">
              <div class="contact__info-header">
                <div class="contact__info-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 6h16v12H4z"></path>
                    <path d="M4 6l8 7 8-7"></path>
                  </svg>
                </div>
                <div>
                  <div class="contact__info-label">Email us</div>
                  <a href="mailto:info@quantsfc.com" class="contact__info-link">info@quantsfc.com</a>
                </div>
              </div>
              <p class="contact__info-description">We typically reply within one business day.</p>
            </div>

            <div class="contact__info-card">
              <h3 class="contact__info-card-title">What can we help with?</h3>
              <div class="contact__help-list">
                @for (item of helpItems; track item.title) {
                  <div class="contact__help-item">
                    <span class="contact__help-dot"></span>
                    <div>
                      <div class="contact__help-title">{{ item.title }}</div>
                      <div class="contact__help-description">{{ item.description }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./contact.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContactComponent {
  name = '';
  email = '';
  message = '';

  readonly helpItems = [
    {
      title: 'Training',
      description: 'Advanced Derivatives, SAP TRM and Corporate Finance courses.'
    },
    {
      title: 'Consulting',
      description: 'Investment finance and corporate finance advisory.'
    },
    {
      title: 'Platform',
      description: 'EOD data, analytics tools and account support.'
    }
  ];

  submitContact(): void {
    // TODO: Replace with actual API call when backend is ready
    console.log('Contact form submitted:', { name: this.name, email: this.email, message: this.message });
    
    // Reset form
    this.name = '';
    this.email = '';
    this.message = '';
    
    // Show success message (would be a toast in real implementation)
    alert('Message sent — we will get back to you shortly');
  }
}

