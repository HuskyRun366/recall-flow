import { Injectable, computed, signal } from '@angular/core';

export interface ConsentState {
  version: number;
  fonts: boolean;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsentService {
  private readonly storageKey = 'recallflow:consent:v1';
  private readonly fontsLinkId = 'rf-google-fonts-material-icons';
  private readonly fontsHref = 'https://fonts.googleapis.com/icon?family=Material+Icons';
  private readonly consentState = signal<ConsentState | null>(null);

  readonly hasDecision = computed(() => this.consentState() !== null);
  readonly fontsAllowed = computed(() => this.consentState()?.fonts === true);

  constructor() {
    this.loadStoredConsent();
  }

  applyStoredConsent(): void {
    this.loadStoredConsent();
  }

  setConsent(fonts: boolean): void {
    const nextState: ConsentState = {
      version: 1,
      fonts,
      updatedAt: new Date().toISOString()
    };

    this.consentState.set(nextState);

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(nextState));
    } catch {
      // Ignore storage failures (banner will reappear on reload).
    }

    if (fonts) {
      this.ensureFontsLoaded();
    } else {
      this.removeFonts();
    }
  }

  resetConsent(): void {
    this.consentState.set(null);
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore storage failures.
    }
    this.removeFonts();
  }

  private loadStoredConsent(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as ConsentState | null;
      if (!parsed || typeof parsed.fonts !== 'boolean') {
        return;
      }

      this.consentState.set(parsed);
      if (parsed.fonts) {
        this.ensureFontsLoaded();
      }
    } catch {
      // Ignore malformed data.
    }
  }

  private ensureFontsLoaded(): void {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.getElementById(this.fontsLinkId)) {
      return;
    }

    const link = document.createElement('link');
    link.id = this.fontsLinkId;
    link.rel = 'stylesheet';
    link.href = this.fontsHref;
    document.head.appendChild(link);
  }

  private removeFonts(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const link = document.getElementById(this.fontsLinkId);
    if (link?.parentNode) {
      link.parentNode.removeChild(link);
    }
  }
}
