import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService, SupportedLanguage } from '../../../core/services/language.service';

/**
 * Language switcher dropdown component
 * Displays current language with flag and allows switching between languages
 */
@Component({
  selector: 'app-language-switcher',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './language-switcher.component.html',
  styleUrls: ['./language-switcher.component.scss']
})
export class LanguageSwitcherComponent {
  languageService = inject(LanguageService);

  isOpen = signal(false);

  toggleDropdown(): void {
    this.isOpen.update(open => !open);
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  selectLanguage(code: SupportedLanguage): void {
    this.languageService.setLanguage(code);
    this.closeDropdown();
  }
}
