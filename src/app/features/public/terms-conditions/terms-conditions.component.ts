import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms-conditions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="terms">
      <div class="terms__header">
        <h1 class="terms__title">Terms & Conditions</h1>
        <p class="terms__date">Last updated: July 2026</p>
      </div>

      <div class="terms__content">
        <section class="terms__section">
          <h2 class="terms__section-title">1. Acceptance of Terms</h2>
          <p class="terms__text">
            By accessing and using the QuantSFC website and services, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">2. Use License</h2>
          <p class="terms__text">
            Permission is granted to temporarily download one copy of the materials (information or software) on the QuantSFC website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul class="terms__list">
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or for any public display</li>
            <li>Attempt to decompile or reverse engineer any software contained on the website</li>
            <li>Remove any copyright or other proprietary notations from the materials</li>
            <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
          </ul>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">3. Disclaimer</h2>
          <p class="terms__text">
            The materials on the QuantSFC website are provided on an 'as is' basis. QuantSFC makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">4. Limitations</h2>
          <p class="terms__text">
            In no event shall QuantSFC or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on the QuantSFC website.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">5. Accuracy of Materials</h2>
          <p class="terms__text">
            The materials appearing on the QuantSFC website could include technical, typographical, or photographic errors. QuantSFC does not warrant that any of the materials on the website are accurate, complete, or current. QuantSFC may make changes to the materials contained on its website at any time without notice.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">6. Links</h2>
          <p class="terms__text">
            QuantSFC has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by QuantSFC of the site. Use of any such linked website is at the user's own risk.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">7. Modifications</h2>
          <p class="terms__text">
            QuantSFC may revise these terms of service for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">8. Governing Law</h2>
          <p class="terms__text">
            These terms and conditions are governed by and construed in accordance with the laws of India, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
          </p>
        </section>

        <section class="terms__section">
          <h2 class="terms__section-title">9. Contact Us</h2>
          <p class="terms__text">
            If you have any questions about these Terms & Conditions, please contact us at:
          </p>
          <p class="terms__text">
            <strong>Email:</strong> <a href="mailto:legal@quantsfc.com">legal@quantsfc.com</a>
          </p>
        </section>
      </div>
    </section>
  `,
  styleUrls: ['./terms-conditions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TermsConditionsComponent {}
