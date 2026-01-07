import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ConsentService } from '../../../core/services/consent.service';

@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './consent-banner.component.html',
  styleUrls: ['./consent-banner.component.scss']
})
export class ConsentBannerComponent {
  private consentService = inject(ConsentService);

  showBanner = computed(() => !this.consentService.hasDecision());

  accept(): void {
    this.consentService.setConsent(true);
  }

  decline(): void {
    this.consentService.setConsent(false);
  }
}
