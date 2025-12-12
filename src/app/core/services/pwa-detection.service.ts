import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PwaDetectionService {
  /**
   * Signal that indicates if the app is running as a PWA (standalone mode)
   */
  isPWA = signal<boolean>(false);

  constructor() {
    this.detectPWAMode();
  }

  /**
   * Detect if the app is running in PWA/standalone mode
   */
  private detectPWAMode(): void {
    // Check various indicators for PWA mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isInWebAppiOS = (window.navigator as any).standalone;

    // Set the signal
    this.isPWA.set(isStandalone || isIOSStandalone || isInWebAppiOS);

    // Listen for display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this.isPWA.set(e.matches);
    });

    if (this.isPWA()) {
      console.log('🚀 Running in PWA mode');
    } else {
      console.log('🌐 Running in browser mode');
    }
  }
}
