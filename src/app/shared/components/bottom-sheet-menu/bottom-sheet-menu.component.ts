import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
  MatBottomSheetModule
} from '@angular/material/bottom-sheet';

export interface BottomSheetAction {
  id: string;
  label: string;
  icon?: string;
  iconSvg?: string;
  color?: 'primary' | 'accent' | 'warn' | 'default';
  disabled?: boolean;
}

export interface BottomSheetMenuData {
  title?: string;
  actions: BottomSheetAction[];
}

@Component({
  selector: 'app-bottom-sheet-menu',
  standalone: true,
  imports: [CommonModule, MatBottomSheetModule],
  template: `
    <div class="bottom-sheet-menu">
      @if (data.title) {
        <div class="menu-header">
          <h3>{{ data.title }}</h3>
        </div>
      }

      <div class="menu-actions">
        @for (action of data.actions; track action.id) {
          <button
            class="menu-action"
            [class.disabled]="action.disabled"
            [disabled]="action.disabled"
            [attr.data-color]="action.color || 'default'"
            (click)="selectAction(action)">
            @if (action.iconSvg) {
              <div class="action-icon" [innerHTML]="action.iconSvg"></div>
            } @else if (action.icon) {
              <div class="action-icon">{{ action.icon }}</div>
            }
            <span class="action-label">{{ action.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../styles/variables' as *;

    .bottom-sheet-menu {
      padding: $spacing-md 0;
    }

    .menu-header {
      padding: 0 $spacing-lg $spacing-md;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }
    }

    .menu-actions {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .menu-action {
      display: flex;
      align-items: center;
      gap: $spacing-md;
      min-height: $touch-target-comfortable;
      padding: $spacing-sm $spacing-lg;
      background: transparent;
      border: none;
      color: var(--color-text-primary);
      font-size: 1rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: background-color $transition-fast;

      &:hover:not(:disabled) {
        background: var(--color-background);
      }

      &:active:not(:disabled) {
        background: var(--color-surface-elevated);
      }

      &.disabled,
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &[data-color="primary"] {
        color: var(--color-primary);
      }

      &[data-color="accent"] {
        color: var(--color-accent);
      }

      &[data-color="warn"] {
        color: var(--color-error);
      }
    }

    .action-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      font-size: 1.25rem;
    }

    .action-label {
      flex: 1;
    }
  `]
})
export class BottomSheetMenuComponent {
  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA) public data: BottomSheetMenuData,
    private bottomSheetRef: MatBottomSheetRef<BottomSheetMenuComponent>
  ) {}

  selectAction(action: BottomSheetAction): void {
    if (action.disabled) {
      return;
    }
    this.bottomSheetRef.dismiss(action.id);
  }
}
