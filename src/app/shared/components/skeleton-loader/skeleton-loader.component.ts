import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton"
         [class.skeleton-card]="type === 'card'"
         [class.skeleton-text]="type === 'text'"
         [class.skeleton-avatar]="type === 'avatar'"
         [style.width]="width"
         [style.height]="height">
    </div>
  `,
  styles: [`
    .skeleton {
      background: linear-gradient(
        90deg,
        var(--color-surface-elevated) 0%,
        var(--color-background) 50%,
        var(--color-surface-elevated) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: var(--radius-md);
    }

    .skeleton-card {
      width: 100%;
      min-height: 440px;
      border-radius: var(--radius-lg);
    }

    .skeleton-text {
      height: 20px;
      width: 100%;
      margin-bottom: 8px;
    }

    .skeleton-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }

    @keyframes shimmer {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }
  `]
})
export class SkeletonLoaderComponent {
  @Input() type: 'card' | 'text' | 'avatar' = 'card';
  @Input() width?: string;
  @Input() height?: string;
}
