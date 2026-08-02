import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="faq">
      <div class="faq__header">
        <h1 class="faq__title">Frequently Asked Questions</h1>
        <p class="faq__subtitle">Find answers to common questions about QuantSFC services and tools</p>
      </div>

      <div class="faq__content">
        <div class="faq__accordion">
          @for (item of faqItems; track item.id) {
            <div class="faq__item" [class.faq__item--open]="openItem() === item.id">
              <button 
                class="faq__button"
                (click)="toggleItem(item.id)"
                [attr.aria-expanded]="openItem() === item.id"
              >
                <span class="faq__question">{{ item.question }}</span>
                <span class="faq__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>
              @if (openItem() === item.id) {
                <div class="faq__answer">
                  <p>{{ item.answer }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./faq.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FaqComponent {
  openItem = signal<number | null>(null);

  readonly faqItems = [
    {
      id: 1,
      question: 'What is QuantSFC?',
      answer: 'QuantSFC is an independent markets consulting firm specializing in capital markets expertise, financial training, and data-driven F&O analytics. We provide professional consulting services, training programs, and analytics tools for derivatives trading and portfolio management.'
    },
    {
      id: 2,
      question: 'How do I access F&O EOD data?',
      answer: 'F&O EOD data is available to everyone for free. Simply visit the Data section of our platform to access the 5-year searchable NSE database filterable by symbol, instrument, strike, expiry and date range.'
    },
    {
      id: 3,
      question: 'What tools require a login?',
      answer: 'Most advanced tools require a free account, including Options Chain, Greeks Calculator, Probability Calculator, Historical Volatility, Implied Volatility, Payoff Simulator, Portfolio Tracking, and Price Alerts. Only F&O EOD Data remains free without login.'
    },
    {
      id: 4,
      question: 'What training programs do you offer?',
      answer: 'We offer three main training programs: Advanced Derivatives Course, SAP Treasury & Risk Management (TRM), and Corporate Finance — Financial Analysis and Valuation. All programs are led by professionals with 16+ years of capital markets experience.'
    },
    {
      id: 5,
      question: 'How can I contact your team for consulting services?',
      answer: 'You can reach out to our team through the Contact page. We respond within one business day. For specific inquiries, you can also email us at info@quantsfc.com with details about your consulting needs.'
    },
    {
      id: 6,
      question: 'Is the platform secure?',
      answer: 'Yes, we use enterprise-grade security measures to protect your data. All transactions and personal information are encrypted, and we comply with industry security standards.'
    },
    {
      id: 7,
      question: 'Can I download historical data?',
      answer: 'Yes, our platform allows you to download F&O EOD data in various formats. Specific download options depend on your subscription tier.'
    },
    {
      id: 8,
      question: 'What payment methods do you accept?',
      answer: 'We accept all major payment methods including credit cards, debit cards, and bank transfers. All payments are processed securely through industry-standard payment gateways.'
    }
  ];

  toggleItem(id: number): void {
    if (this.openItem() === id) {
      this.openItem.set(null);
    } else {
      this.openItem.set(id);
    }
  }
}
