import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../../core/services/pwa.service';

@Component({
  selector: 'app-pwa-update-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (pwaService.updateAvailable() && !dismissed) {
      <div class="update-prompt">
        <div class="update-content">
          <div class="update-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
            </svg>
          </div>
          <div class="update-text">
            <strong>Update verfügbar</strong>
            <p>Eine neue Version von RecallFlow ist verfügbar</p>
          </div>
          <div class="update-actions">
            <button class="btn-update" (click)="update()">
              Jetzt aktualisieren
            </button>
            <button class="btn-later" (click)="dismiss()">
              Später
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .update-prompt {
      position: fixed;
      top: 80px;
      right: $spacing-lg;
      z-index: 1000;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: $radius-lg;
      padding: $spacing-md;
      box-shadow: $shadow-lg;
      max-width: 400px;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .update-content {
      display: flex;
      align-items: flex-start;
      gap: $spacing-md;
    }

	    .update-icon {
	      display: flex;
	      align-items: center;
	      justify-content: center;
	      width: 40px;
	      height: 40px;
	      background: var(--gradient-primary);
	      border-radius: 50%;
	      flex-shrink: 0;
	      color: var(--color-on-gradient);

	      svg {
	        width: 24px;
	        height: 24px;
      }
    }

    .update-text {
      flex: 1;
      min-width: 0;

      strong {
        display: block;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin-bottom: 4px;
      }

      p {
        margin: 0 0 $spacing-md 0;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
      }
    }

    .update-actions {
      display: flex;
      gap: $spacing-sm;
      margin-top: $spacing-sm;
    }

    .btn-update,
    .btn-later {
      padding: $spacing-xs $spacing-md;
      border: none;
      border-radius: $radius-md;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all $transition-fast;
    }

	    .btn-update {
	      background: var(--gradient-primary);
	      color: var(--color-on-gradient);
	      flex: 1;

	      &:hover {
	        transform: translateY(-1px);
	        box-shadow: $shadow-md;
      }

      &:active {
        transform: translateY(0);
      }
    }

    .btn-later {
      background: var(--color-background);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);

      &:hover {
        background: var(--color-surface-elevated);
        color: var(--color-text-primary);
      }
    }

    @media (max-width: 768px) {
      .update-prompt {
        top: 70px;
        right: $spacing-sm;
        left: $spacing-sm;
        max-width: none;
      }
    }

    @media (max-width: 480px) {
      .update-content {
        flex-direction: column;
      }

      .update-actions {
        width: 100%;
        flex-direction: column;

        button {
          width: 100%;
        }
      }
    }
  `]
})
export class PwaUpdatePromptComponent {
  pwaService = inject(PwaService);
  dismissed = false;

  async update(): Promise<void> {
    await this.pwaService.activateUpdate();
  }

  dismiss(): void {
    this.dismissed = true;
  }
}
