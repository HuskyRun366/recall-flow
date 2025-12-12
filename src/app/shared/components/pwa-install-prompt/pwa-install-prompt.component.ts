import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../../core/services/pwa.service';

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (pwaService.canInstall() && !dismissed) {
      <div class="install-prompt">
        <div class="install-content">
          <div class="install-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
            </svg>
          </div>
          <div class="install-text">
            <strong>RecallFlow installieren</strong>
            <p>Für schnelleren Zugriff zur Startseite hinzufügen</p>
          </div>
          <div class="install-screenshots" *ngIf="screenshots.length">
            <div class="shot" *ngFor="let shot of screenshots">
              <img [src]="shot" alt="App Screenshot">
            </div>
          </div>
          <div class="install-actions">
            <button class="btn-install" (click)="install()">
              Installieren
            </button>
            <button class="btn-dismiss" (click)="dismiss()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .install-prompt {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
      color: white;
      padding: $spacing-md;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }

    .install-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: $spacing-md;
      flex-wrap: wrap;
    }

    .install-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      flex-shrink: 0;

      svg {
        width: 24px;
        height: 24px;
      }
    }

    .install-screenshots {
      display: flex;
      gap: $spacing-sm;
      max-width: 100%;
      overflow-x: auto;
      padding: $spacing-xs 0;
    }

    .shot {
      width: 120px;
      height: 80px;
      border-radius: $radius-md;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.2);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .install-text {
      flex: 1;
      min-width: 0;

      strong {
        display: block;
        font-size: 1rem;
        font-weight: 700;
        margin-bottom: 2px;
      }

      p {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.9;
      }
    }

    .install-actions {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
      flex-shrink: 0;
    }

    .btn-install {
      padding: $spacing-sm $spacing-lg;
      background: white;
      color: var(--color-primary);
      border: none;
      border-radius: $radius-md;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all $transition-fast;
      white-space: nowrap;

      &:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      }

      &:active {
        transform: scale(0.98);
      }
    }

    .btn-dismiss {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: all $transition-fast;
      color: white;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      &:active {
        transform: scale(0.9);
      }
    }

    @media (max-width: 640px) {
      .install-prompt {
        padding: $spacing-sm $spacing-md;
      }

      .install-text {
        p {
          display: none;
        }
      }

      .btn-install {
        padding: $spacing-xs $spacing-md;
        font-size: 0.85rem;
      }
    }
  `]
})
export class PwaInstallPromptComponent {
  pwaService = inject(PwaService);
  dismissed = false;
  screenshots = ['/IMG_3626.png', '/IMG_3627.png', '/IMG_3628.png', '/IMG_3629.png'];

  constructor() {
    // Check if prompt was previously dismissed
    const wasDismissed = localStorage.getItem('android-install-prompt-dismissed') === 'true';
    this.dismissed = wasDismissed;
  }

  async install(): Promise<void> {
    const installed = await this.pwaService.promptInstall();
    if (installed) {
      this.dismissed = true;
      localStorage.setItem('android-install-prompt-dismissed', 'true');
    }
  }

  dismiss(): void {
    this.dismissed = true;
    localStorage.setItem('android-install-prompt-dismissed', 'true');
    this.pwaService.dismissInstallPrompt();
  }
}
