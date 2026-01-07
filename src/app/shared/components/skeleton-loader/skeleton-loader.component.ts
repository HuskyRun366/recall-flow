import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (type) {
      @case ('search-bar') {
        <div class="skeleton-search-bar">
          <div class="skel-item skel-search-icon"></div>
          <div class="skel-item skel-search-input"></div>
          <div class="skel-item skel-search-count"></div>
        </div>
      }
      @case ('stat-card') {
        <div class="skeleton-stat-card">
          <div class="skel-item skel-stat-icon"></div>
          <div class="skel-stat-content">
            <div class="skel-item skel-stat-value"></div>
            <div class="skel-item skel-stat-label"></div>
          </div>
        </div>
      }
      @case ('quiz-card') {
        <div class="skeleton-quiz-card">
          <!-- Header: Title + Badges -->
          <div class="skel-header">
            <div class="skel-item skel-title"></div>
            <div class="skel-badges">
              <div class="skel-item skel-badge"></div>
            </div>
          </div>

          <!-- Description -->
          <div class="skel-item skel-desc-1"></div>
          <div class="skel-item skel-desc-2"></div>

          <!-- Meta -->
          <div class="skel-meta">
            <div class="skel-item skel-meta-item"></div>
          </div>

          <!-- Divider -->
          <div class="skel-divider"></div>

          <!-- Progress Section -->
          <div class="skel-progress-section">
            <div class="skel-item skel-progress-title"></div>
            @for (i of [1,2,3,4]; track i) {
              <div class="skel-progress-row">
                <div class="skel-item skel-dot"></div>
                <div class="skel-item skel-label"></div>
                <div class="skel-item skel-bar"></div>
                <div class="skel-item skel-value"></div>
              </div>
            }
          </div>

          <!-- Actions -->
          <div class="skel-actions">
            <div class="skel-item skel-btn"></div>
            <div class="skel-item skel-btn"></div>
          </div>
        </div>
      }
      @case ('marketplace-card') {
        <div class="skeleton-marketplace-card">
          <!-- Type Badge -->
          <div class="skel-item skel-type-badge"></div>

          <!-- Title -->
          <div class="skel-item skel-title"></div>

          <!-- Description -->
          <div class="skel-item skel-desc-1"></div>
          <div class="skel-item skel-desc-2"></div>

          <!-- Meta Badges -->
          <div class="skel-meta-badges">
            <div class="skel-item skel-meta-badge"></div>
            <div class="skel-item skel-meta-badge"></div>
            <div class="skel-item skel-meta-badge"></div>
          </div>

          <!-- Rating -->
          <div class="skel-rating">
            <div class="skel-item skel-stars"></div>
          </div>

          <!-- Stats -->
          <div class="skel-stats">
            <div class="skel-stat">
              <div class="skel-item skel-stat-value"></div>
              <div class="skel-item skel-stat-label"></div>
            </div>
            <div class="skel-stat">
              <div class="skel-item skel-stat-value"></div>
              <div class="skel-item skel-stat-label"></div>
            </div>
          </div>

          <!-- Actions -->
          <div class="skel-card-actions">
            <div class="skel-item skel-link"></div>
            <div class="skel-item skel-add-btn"></div>
          </div>
        </div>
      }
      @default {
        <div class="skeleton"
             [class.skeleton-card]="type === 'card'"
             [class.skeleton-text]="type === 'text'"
             [class.skeleton-avatar]="type === 'avatar'"
             [style.width]="width"
             [style.height]="height">
        </div>
      }
    }
  `,
  styles: [`
    /* Base shimmer animation */
    .skel-item {
      background: linear-gradient(
        90deg,
        var(--color-surface-elevated) 0%,
        var(--color-background) 50%,
        var(--color-surface-elevated) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: var(--radius-sm);
    }

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

    /* Search Bar Skeleton */
    .skeleton-search-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 12px 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      margin-bottom: 32px;
    }

    .skeleton-search-bar .skel-search-icon {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .skeleton-search-bar .skel-search-input {
      flex: 1;
      height: 20px;
      border-radius: var(--radius-sm);
    }

    .skeleton-search-bar .skel-search-count {
      width: 80px;
      height: 16px;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
    }

    /* Stat Card Skeleton */
    .skeleton-stat-card {
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .skeleton-stat-card .skel-stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .skeleton-stat-card .skel-stat-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .skeleton-stat-card .skel-stat-value {
      width: 60px;
      height: 28px;
      border-radius: var(--radius-sm);
    }

    .skeleton-stat-card .skel-stat-label {
      width: 80px;
      height: 14px;
      border-radius: var(--radius-sm);
    }

    /* Quiz Card Skeleton */
    .skeleton-quiz-card {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .skeleton-quiz-card .skel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .skeleton-quiz-card .skel-title {
      height: 28px;
      width: 60%;
      border-radius: var(--radius-md);
    }

    .skeleton-quiz-card .skel-badges {
      display: flex;
      gap: 8px;
    }

    .skeleton-quiz-card .skel-badge {
      height: 24px;
      width: 70px;
      border-radius: var(--radius-md);
    }

    .skeleton-quiz-card .skel-desc-1 {
      height: 16px;
      width: 100%;
    }

    .skeleton-quiz-card .skel-desc-2 {
      height: 16px;
      width: 75%;
    }

    .skeleton-quiz-card .skel-meta {
      display: flex;
      gap: 16px;
    }

    .skeleton-quiz-card .skel-meta-item {
      height: 18px;
      width: 100px;
    }

    .skeleton-quiz-card .skel-divider {
      height: 1px;
      background: var(--color-border);
      margin: 8px 0;
    }

    .skeleton-quiz-card .skel-progress-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skeleton-quiz-card .skel-progress-title {
      height: 18px;
      width: 140px;
      margin-bottom: 4px;
    }

    .skeleton-quiz-card .skel-progress-row {
      display: grid;
      grid-template-columns: 12px 100px 1fr 30px;
      align-items: center;
      gap: 12px;
    }

    .skeleton-quiz-card .skel-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .skeleton-quiz-card .skel-label {
      height: 14px;
      width: 80%;
    }

    .skeleton-quiz-card .skel-bar {
      height: 8px;
      width: 100%;
      border-radius: 4px;
    }

    .skeleton-quiz-card .skel-value {
      height: 14px;
      width: 100%;
    }

    .skeleton-quiz-card .skel-actions {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    .skeleton-quiz-card .skel-btn {
      flex: 1;
      height: 44px;
      border-radius: var(--radius-md);
    }

    /* Marketplace Card Skeleton */
    .skeleton-marketplace-card {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .skeleton-marketplace-card .skel-type-badge {
      height: 24px;
      width: 80px;
      border-radius: var(--radius-md);
    }

    .skeleton-marketplace-card .skel-title {
      height: 22px;
      width: 85%;
      border-radius: var(--radius-md);
    }

    .skeleton-marketplace-card .skel-desc-1 {
      height: 14px;
      width: 100%;
    }

    .skeleton-marketplace-card .skel-desc-2 {
      height: 14px;
      width: 65%;
    }

    .skeleton-marketplace-card .skel-meta-badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .skeleton-marketplace-card .skel-meta-badge {
      height: 20px;
      width: 50px;
      border-radius: var(--radius-sm);
    }

    .skeleton-marketplace-card .skel-rating {
      display: flex;
      justify-content: flex-end;
      padding: 8px 0;
    }

    .skeleton-marketplace-card .skel-stars {
      height: 16px;
      width: 100px;
    }

    .skeleton-marketplace-card .skel-stats {
      display: flex;
      gap: 24px;
      padding-top: 12px;
      border-top: 1px solid var(--color-border);
    }

    .skeleton-marketplace-card .skel-stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .skeleton-marketplace-card .skel-stat-value {
      height: 18px;
      width: 40px;
    }

    .skeleton-marketplace-card .skel-stat-label {
      height: 12px;
      width: 50px;
    }

    .skeleton-marketplace-card .skel-card-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
    }

    .skeleton-marketplace-card .skel-link {
      height: 16px;
      width: 70px;
    }

    .skeleton-marketplace-card .skel-add-btn {
      height: 32px;
      width: 100px;
      border-radius: var(--radius-md);
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
  @Input() type: 'card' | 'text' | 'avatar' | 'quiz-card' | 'marketplace-card' | 'search-bar' | 'stat-card' = 'card';
  @Input() width?: string;
  @Input() height?: string;
}
