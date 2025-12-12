import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'quiz-app-theme';

  // Signal for reactive theme state
  theme = signal<Theme>(this.getStoredTheme());

  constructor() {
    // Apply theme on initialization
    this.applyTheme(this.theme());

    // Effect to persist theme changes
    effect(() => {
      const currentTheme = this.theme();
      localStorage.setItem(this.THEME_KEY, currentTheme);
      this.applyTheme(currentTheme);
    });
  }

  toggleTheme(): void {
    this.theme.update(current => current === 'light' ? 'dark' : 'light');
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
  }

  private getStoredTheme(): Theme {
    const stored = localStorage.getItem(this.THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  }

  private applyTheme(theme: Theme): void {
    const htmlElement = document.documentElement;
    htmlElement.classList.remove('light-theme', 'dark-theme');
    htmlElement.classList.add(`${theme}-theme`);
    htmlElement.setAttribute('data-theme', theme);
  }
}
