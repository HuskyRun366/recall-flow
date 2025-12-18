import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

export interface ProgressItem {
  level: 0 | 1 | 2 | 3;
  label: string;
  labelKey?: string;
  count: number;
  percentage: number;
}

export interface ProgressBarConfig {
  items: ProgressItem[];
  showCount?: boolean;
}

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './progress-bar.component.html',
  styleUrls: ['./progress-bar.component.scss']
})
export class ProgressBarComponent {
  config = input.required<ProgressBarConfig>();

  items = computed(() => this.config().items);
  showCount = computed(() => this.config().showCount ?? true);
}
