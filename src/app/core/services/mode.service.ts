import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

export type AppMode = 'quiz' | 'lernen';

/**
 * Service to manage app mode state (Quiz vs Lernen)
 * Provides reactive signals for mode switching and persistence to localStorage
 *
 * Pattern mirrors ThemeService for consistency
 */
@Injectable({
  providedIn: 'root'
})
export class ModeService {
  private readonly MODE_STORAGE_KEY = 'app-mode';
  private router = inject(Router);

  // Signal for current mode
  private modeSignal = signal<AppMode>(this.getInitialMode());

  // Public computed properties
  mode = computed(() => this.modeSignal());
  isQuizMode = computed(() => this.modeSignal() === 'quiz');
  isLernenMode = computed(() => this.modeSignal() === 'lernen');

  constructor() {
    // Persist mode changes to localStorage
    effect(() => {
      localStorage.setItem(this.MODE_STORAGE_KEY, this.mode());
    });
  }

  /**
   * Get initial mode from localStorage or default to 'quiz'
   */
  private getInitialMode(): AppMode {
    const stored = localStorage.getItem(this.MODE_STORAGE_KEY);
    return (stored === 'quiz' || stored === 'lernen') ? stored : 'quiz';
  }

  /**
   * Switch to specified mode and navigate to corresponding home
   */
  async setMode(mode: AppMode): Promise<void> {
    if (this.modeSignal() === mode) return; // Already in this mode

    this.modeSignal.set(mode);

    // Navigate to mode's home page
    const homeRoute = mode === 'quiz' ? '/home' : '/lernen/home';
    await this.router.navigate([homeRoute]);
  }

  /**
   * Toggle between modes
   */
  async toggleMode(): Promise<void> {
    const newMode = this.mode() === 'quiz' ? 'lernen' : 'quiz';
    await this.setMode(newMode);
  }

  /**
   * Get home route for current mode
   */
  getHomeRoute(): string {
    return this.mode() === 'quiz' ? '/home' : '/lernen/home';
  }

  /**
   * Get list route for current mode
   */
  getListRoute(): string {
    return this.mode() === 'quiz' ? '/quizzes' : '/lernen/decks';
  }
}
