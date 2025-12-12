import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkStatusService } from '../../../core/services/network-status.service';

@Component({
  selector: 'app-network-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (!networkStatus.isOnline()) {
      <div class="network-status offline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
        <span>Offline-Modus</span>
        <div class="status-dot"></div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .network-status {
      display: flex;
      align-items: center;
      gap: $spacing-xs;
      padding: $spacing-xs $spacing-sm;
      border-radius: $radius-md;
      font-size: 0.85rem;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;

      &.offline {
        background: rgba(255, 152, 0, 0.1);
        color: #ff9800;
        border: 1px solid rgba(255, 152, 0, 0.3);
      }

      svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      span {
        white-space: nowrap;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
        animation: pulse 2s ease-in-out infinite;
      }
    }

    @keyframes slideIn {
      from {
        transform: translateY(-10px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    @media (max-width: 480px) {
      .network-status {
        font-size: 0.75rem;
        padding: $spacing-xs;

        span {
          display: none;
        }
      }
    }
  `]
})
export class NetworkStatusComponent {
  networkStatus = inject(NetworkStatusService);
}
