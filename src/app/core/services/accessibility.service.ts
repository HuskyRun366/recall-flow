import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ColorThemeService } from './color-theme.service';

const STORAGE_FONT_SCALE = 'quiz-app-accessibility-font-scale';
const STORAGE_DYSLEXIC_FONT = 'quiz-app-accessibility-dyslexic-font';
const STORAGE_LAST_THEME = 'quiz-app-accessibility-last-theme';

const HIGH_CONTRAST_THEME_ID = 'high-contrast';
const DEFAULT_FONT_SCALE = 1;
const MIN_FONT_SCALE = 0.85;
const MAX_FONT_SCALE = 1.3;
const FONT_SCALE_STEP = 0.05;

@Injectable({
  providedIn: 'root'
})
export class AccessibilityService {
  private colorThemes = inject(ColorThemeService);

  private fontScaleSignal = signal<number>(DEFAULT_FONT_SCALE);
  private dyslexicFontSignal = signal<boolean>(false);
  private lastNonHighContrastThemeId = signal<string | null>(null);

  fontScale = computed(() => this.fontScaleSignal());
  dyslexicFontEnabled = computed(() => this.dyslexicFontSignal());
  highContrastEnabled = computed(() => this.colorThemes.activeThemeId() === HIGH_CONTRAST_THEME_ID);

  readonly fontScaleMin = MIN_FONT_SCALE;
  readonly fontScaleMax = MAX_FONT_SCALE;
  readonly fontScaleStep = FONT_SCALE_STEP;
  readonly fontScaleDefault = DEFAULT_FONT_SCALE;

  constructor() {
    this.fontScaleSignal.set(this.loadFontScale());
    this.dyslexicFontSignal.set(this.loadBoolean(STORAGE_DYSLEXIC_FONT));

    const activeThemeId = this.colorThemes.activeThemeId();

    const storedLastTheme = this.loadLastThemeId();
    if (storedLastTheme) {
      this.lastNonHighContrastThemeId.set(storedLastTheme);
    } else if (activeThemeId !== HIGH_CONTRAST_THEME_ID) {
      this.lastNonHighContrastThemeId.set(activeThemeId);
    }

    effect(() => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_FONT_SCALE, String(this.fontScaleSignal()));
    });

    effect(() => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_DYSLEXIC_FONT, String(this.dyslexicFontSignal()));
    });

    effect(() => {
      const activeId = this.colorThemes.activeThemeId();
      if (activeId !== HIGH_CONTRAST_THEME_ID) {
        this.lastNonHighContrastThemeId.set(activeId);
      }
    });

    effect(() => {
      if (typeof localStorage === 'undefined') return;
      const themeId = this.lastNonHighContrastThemeId();
      if (themeId) {
        localStorage.setItem(STORAGE_LAST_THEME, themeId);
      }
    });

    effect(() => {
      this.applyFontScale(this.fontScaleSignal());
    });

    effect(() => {
      this.applyDyslexicFont(this.dyslexicFontSignal());
    });

  }

  setFontScale(value: number): void {
    const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value));
    const rounded = Math.round(clamped / FONT_SCALE_STEP) * FONT_SCALE_STEP;
    const normalized = Number(rounded.toFixed(2));
    this.fontScaleSignal.set(normalized);
  }

  increaseFontScale(): void {
    this.setFontScale(this.fontScaleSignal() + FONT_SCALE_STEP);
  }

  decreaseFontScale(): void {
    this.setFontScale(this.fontScaleSignal() - FONT_SCALE_STEP);
  }

  resetFontScale(): void {
    this.fontScaleSignal.set(DEFAULT_FONT_SCALE);
  }

  setDyslexicFontEnabled(enabled: boolean): void {
    this.dyslexicFontSignal.set(enabled);
  }

  toggleDyslexicFont(): void {
    this.dyslexicFontSignal.update((value) => !value);
  }

  setHighContrastEnabled(enabled: boolean): void {
    if (enabled) {
      const activeId = this.colorThemes.activeThemeId();
      if (activeId !== HIGH_CONTRAST_THEME_ID) {
        this.lastNonHighContrastThemeId.set(activeId);
        this.colorThemes.setActiveThemeId(HIGH_CONTRAST_THEME_ID);
      }
      return;
    }

    if (this.colorThemes.activeThemeId() === HIGH_CONTRAST_THEME_ID) {
      const restoreId = this.lastNonHighContrastThemeId();
      if (restoreId && restoreId !== HIGH_CONTRAST_THEME_ID) {
        this.colorThemes.setActiveThemeId(restoreId);
      } else {
        this.colorThemes.resetToDefault();
      }
    }
  }

  private applyFontScale(value: number): void {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--app-font-scale', String(value));
  }

  private applyDyslexicFont(enabled: boolean): void {
    if (typeof document === 'undefined') return;
    if (enabled) {
      document.documentElement.style.setProperty(
        '--app-font-family',
        "'OpenDyslexic', var(--app-font-family-default)"
      );
    } else {
      document.documentElement.style.removeProperty('--app-font-family');
    }
  }

  private loadFontScale(): number {
    if (typeof localStorage === 'undefined') return DEFAULT_FONT_SCALE;
    const raw = localStorage.getItem(STORAGE_FONT_SCALE);
    const parsed = raw ? Number.parseFloat(raw) : DEFAULT_FONT_SCALE;
    if (Number.isNaN(parsed)) return DEFAULT_FONT_SCALE;
    return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, parsed));
  }

  private loadBoolean(key: string): boolean {
    const value = this.loadOptionalBoolean(key);
    return value ?? false;
  }

  private loadOptionalBoolean(key: string): boolean | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  }

  private loadLastThemeId(): string | null {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_LAST_THEME);
    if (!stored || stored === HIGH_CONTRAST_THEME_ID) return null;
    return stored;
  }
}
