import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LevelBadgeConfig {
  level: 0 | 1 | 2 | 3;
  showLabel?: boolean;
}

@Component({
  selector: 'app-level-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './level-badge.component.html',
  styleUrls: ['./level-badge.component.scss']
})
export class LevelBadgeComponent {
  config = input.required<LevelBadgeConfig>();

  level = computed(() => this.config().level);
  showLabel = computed(() => this.config().showLabel ?? true);

  levelColor = computed(() => {
    const level = this.level();
    const colors = {
      0: 'var(--level-0-color, #EF5350)',
      1: 'var(--level-1-color, #FFCA28)',
      2: 'var(--level-2-color, #66BB6A)',
      3: 'var(--level-3-color, #2E7D32)'
    };
    return colors[level];
  });

  displayText = computed(() => {
    return this.showLabel() ? `Level ${this.level()}` : `${this.level()}`;
  });
}
