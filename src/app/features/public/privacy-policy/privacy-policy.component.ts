import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="privacy">
      <div class="privacy__header">
        <h1 class="privacy__title">Privacy Policy</h1>
        <p class="privacy__date">Last updated: July 2026</p>
      </div>

      <div class="privacy__content">
        <section class="privacy__section">
          <h2 class="privacy__section-title">1. Introduction</h2>
          <p class="privacy__text">
            QuantSFC is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.
          </p>
        </section>

        <section class="privacy__section">
          <h2 class="privacy__section-title">2. Information We Collect</h2>
          <p class="privacy__text">
            We may collect information about you in a variety of ways. The information we may collect on the site includes:
          </p>
          <ul class="privacy__list">
            <li>Personal Data: Name, email address, phone number, and other contact information you provide directly</li>
            <li>Financial Information: Trading history, portfolio data, and financial preferences for service delivery</li>
            <li>Usage Data: Pages visited, links clicked, and features accessed on our platform</li>
            <li>Technical Data: IP address, browser type, operating system, and device information</li>
          </ul>
        </section>

        <section class="privacy__section">
          <h2 class="privacy__section-title">3. Use of Information</h2>
          <p class="privacy__text">
            Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected from you via the site to:
          </p>
          <ul class="privacy__list">
            <li>Create and manage your account</li>
            <li>Deliver services and send related information</li>
            <li>Email you regarding your account or order</li>
            <li>Generate reports and analytics</li>
            <li>Improve our website and services</li>
          </ul>
        </section>

        <section class="privacy__section">
          <h2 class="privacy__section-title">4. Disclosure of Your Information</h2>
          <p class="privacy__text">
            We may share your information with third parties in certain circumstances, including:
          </p>
          <ul class="privacy__list">
            <li>Service providers who assist in operating our website and conducting our business</li>
            <li>Legal authorities when required by law or to protect our rights</li>
            <li>Business partners for joint ventures or collaborations</li>
          </ul>
        </section>

        <section class="privacy__section">
          <h2 class="privacy__section-title">5. Security of Your Information</h2>
          <p class="privacy__text">
            We use administrative, technical, and physical security measures to help protect your personal information. While we strive to use commercially acceptable means to protect your personal information, we cannot guarantee its absolute security.
          </p>
        </section>

        <section class="privacy__section">
          <h2 class="privacy__section-title">6. Contact Us</h2>
          <p class="privacy__text">
            If you have questions or comments about this Privacy Policy, please contact us at:
          </p>
          <p class="privacy__text">
            <strong>Email:</strong> <a href="mailto:privacy@quantsfc.com">privacy@quantsfc.com</a>
          </p>
        </section>
      </div>
    </section>
  `,
  styleUrls: ['./privacy-policy.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PrivacyPolicyComponent {}
