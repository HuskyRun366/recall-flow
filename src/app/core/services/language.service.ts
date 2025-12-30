import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Firestore, doc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { AuthService } from './auth.service';

export type SupportedLanguage = 'de' | 'en' | 'fr' | 'es';

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

/**
 * Service for managing application language/localization
 * Features:
 * - Browser language auto-detection
 * - Language persistence to localStorage
 * - Signal-based reactive language state
 */
@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly LANGUAGE_STORAGE_KEY = 'app-language';
  private translateService = inject(TranslateService);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private lastSyncedUserId: string | null = null;
  private lastSyncedLanguage: SupportedLanguage | null = null;

  // Available languages
  readonly availableLanguages: LanguageInfo[] = [
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' }
  ];

  // Signal for current language
  private languageSignal = signal<SupportedLanguage>(this.getInitialLanguage());

  // Public computed properties
  language = computed(() => this.languageSignal());
  currentLanguageInfo = computed(() =>
    this.availableLanguages.find(l => l.code === this.languageSignal()) || this.availableLanguages[0]
  );

  constructor() {
    // Initialize translation service with available languages
    this.translateService.addLangs(['de', 'en', 'fr', 'es']);
    this.translateService.setDefaultLang('de');

    // Set initial language
    this.translateService.use(this.languageSignal());

    // Persist language changes to localStorage
    effect(() => {
      const lang = this.languageSignal();
      localStorage.setItem(this.LANGUAGE_STORAGE_KEY, lang);
    });

    // Persist language to the user profile (one language per user)
    effect(() => {
      const lang = this.languageSignal();
      const user = this.authService.currentUser();

      if (!user) {
        this.lastSyncedUserId = null;
        this.lastSyncedLanguage = null;
        return;
      }

      if (this.lastSyncedUserId === user.uid && this.lastSyncedLanguage === lang) {
        return;
      }

      this.lastSyncedUserId = user.uid;
      this.lastSyncedLanguage = lang;

      updateDoc(doc(this.firestore, `users/${user.uid}`), {
        language: lang,
        languageUpdatedAt: serverTimestamp()
      }).catch(error => {
        console.warn('Could not update user language:', error);
      });
    });
  }

  /**
   * Get initial language from localStorage or browser settings
   */
  private getInitialLanguage(): SupportedLanguage {
    // Check localStorage first
    const stored = localStorage.getItem(this.LANGUAGE_STORAGE_KEY);
    if (stored && this.isValidLanguage(stored)) {
      return stored as SupportedLanguage;
    }

    // Auto-detect from browser
    return this.detectBrowserLanguage();
  }

  /**
   * Detect browser language and map to supported language
   */
  private detectBrowserLanguage(): SupportedLanguage {
    if (typeof navigator === 'undefined') {
      return 'de'; // Default fallback for SSR
    }

    const browserLang = navigator.language || (navigator as any).userLanguage;
    if (!browserLang) {
      return 'de';
    }

    // Extract primary language code (e.g., 'en-US' -> 'en')
    const primaryLang = browserLang.split('-')[0].toLowerCase();

    // Map to supported languages
    if (this.isValidLanguage(primaryLang)) {
      return primaryLang as SupportedLanguage;
    }

    // Default to German if not supported
    return 'de';
  }

  /**
   * Check if a language code is supported
   */
  private isValidLanguage(lang: string): boolean {
    return ['de', 'en', 'fr', 'es'].includes(lang);
  }

  /**
   * Switch to specified language
   */
  setLanguage(lang: SupportedLanguage): void {
    if (!this.isValidLanguage(lang)) {
      console.warn(`Language ${lang} is not supported`);
      return;
    }

    this.languageSignal.set(lang);
    this.translateService.use(lang);
  }

  /**
   * Get language info by code
   */
  getLanguageInfo(code: SupportedLanguage): LanguageInfo | undefined {
    return this.availableLanguages.find(l => l.code === code);
  }

  /**
   * Translate a key instantly (synchronous)
   * Use this for simple translations in code
   */
  instant(key: string, params?: Record<string, unknown>): string {
    return this.translateService.instant(key, params);
  }
}
