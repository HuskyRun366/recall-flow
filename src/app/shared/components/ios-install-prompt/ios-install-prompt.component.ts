import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ios-install-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showPrompt()) {
      <div class="ios-install-prompt">
        <div class="prompt-content">
          <button class="close-btn" (click)="dismiss()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>

          <div class="prompt-icon">
            <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="64" height="64" rx="12" fill="var(--color-primary)"/>
              <circle cx="24" cy="32" r="8" fill="white" opacity="0.3"/>
              <circle cx="32" cy="32" r="8" fill="white" opacity="0.6"/>
              <circle cx="40" cy="32" r="8" fill="white" opacity="0.9"/>
              <path d="M46 32L50 32L48 28M48 36L50 32" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>

          <div class="prompt-text">
            <h3>RecallFlow installieren</h3>
            <p>Installiere die App für ein besseres Erlebnis</p>
          </div>

          <div class="prompt-steps">
            <div class="step">
              <div class="step-number">1</div>
              <div class="step-text">
                Tippe auf
                <svg class="share-icon" stroke="currentColor" stroke-width="2" fill="none" width="24" height="30" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
                  <path d="M30.3 13.7L25 8.4l-5.3 5.3-1.4-1.4L25 5.6l6.7 6.7z"/>
                  <path d="M24 7h2v21h-2z"/>
                  <path d="M35 40H15c-1.7 0-3-1.3-3-3V19c0-1.7 1.3-3 3-3h7v2h-7c-.6 0-1 .4-1 1v18c0 .6.4 1 1 1h20c.6 0 1-.4 1-1V19c0-.6-.4-1-1-1h-7v-2h7c1.7 0 3 1.3 3 3v18c0 1.7-1.3 3-3 3z"/>
                </svg>
                unten
              </div>
            </div>
            <div class="step">
              <div class="step-number">2</div>
              <div class="step-text">Wähle "Zum Home-Bildschirm hinzufügen"</div>
            </div>
            <div class="step">
              <div class="step-number">3</div>
              <div class="step-text">Tippe "Hinzufügen"</div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .ios-install-prompt {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s ease-out;
      padding: $spacing-lg;
      max-height: 80vh;
      overflow-y: auto;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }

    .prompt-content {
      max-width: 500px;
      margin: 0 auto;
      position: relative;
    }

    .close-btn {
      position: absolute;
      top: -$spacing-sm;
      right: -$spacing-sm;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background);
      border: 1px solid var(--color-border);
      border-radius: 50%;
      cursor: pointer;
      color: var(--color-text-secondary);
      transition: all $transition-fast;

      &:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text-primary);
      }
    }

    .prompt-icon {
      display: flex;
      justify-content: center;
      margin-bottom: $spacing-md;

      svg {
        width: 64px;
        height: 64px;
      }
    }

    .prompt-text {
      text-align: center;
      margin-bottom: $spacing-lg;

      h3 {
        margin: 0 0 $spacing-xs 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
      }
    }

    .prompt-steps {
      display: flex;
      flex-direction: column;
      gap: $spacing-md;
    }

    .step {
      display: flex;
      align-items: center;
      gap: $spacing-md;
      padding: $spacing-md;
      background: var(--color-background);
      border: 1px solid var(--color-border);
      border-radius: $radius-lg;
    }

    .step-number {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-primary);
      color: white;
      border-radius: 50%;
      font-weight: 700;
      font-size: 0.9rem;
      flex-shrink: 0;
    }

    .step-text {
      flex: 1;
      font-size: 0.95rem;
      color: var(--color-text-primary);
      display: flex;
      align-items: center;
      gap: $spacing-xs;

      .share-icon {
        display: inline-block;
        vertical-align: middle;
        color: var(--color-primary);
      }
    }

    @media (max-width: 480px) {
      .ios-install-prompt {
        padding: $spacing-md;
      }

      .step {
        padding: $spacing-sm;
      }

      .step-text {
        font-size: 0.85rem;
      }
    }
  `]
})
export class IosInstallPromptComponent {
  showPrompt = signal(false);

  constructor() {
    this.checkIfShouldShow();
  }

  private checkIfShouldShow(): void {
    // Nur auf iOS Safari zeigen
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;

    // Wurde schon dismissed?
    const wasDismissed = localStorage.getItem('ios-install-prompt-dismissed') === 'true';

    // Zeige nur wenn: iOS + Safari (nicht standalone) + nicht dismissed
    if (isIOS && !isInStandaloneMode && !wasDismissed) {
      // Verzögert anzeigen (nach 3 Sekunden)
      setTimeout(() => {
        this.showPrompt.set(true);
      }, 3000);
    }
  }

  dismiss(): void {
    this.showPrompt.set(false);
    localStorage.setItem('ios-install-prompt-dismissed', 'true');
  }
}
