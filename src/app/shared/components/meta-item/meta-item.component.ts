import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MetaItemConfig {
  icon: string;
  label: string;
  value: string | number;
  layout?: 'inline' | 'stacked';
}

@Component({
  selector: 'app-meta-item',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './meta-item.component.html',
  styleUrls: ['./meta-item.component.scss']
})
export class MetaItemComponent {
  config = input.required<MetaItemConfig>();

  icon = computed(() => this.config().icon);
  label = computed(() => this.config().label);
  value = computed(() => this.config().value);
  layout = computed(() => this.config().layout || 'stacked');
  isStacked = computed(() => this.layout() === 'stacked');
}
