import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'public' | 'unlisted' | 'private' | 'download' | 'success' | 'error' | 'warning';

export interface BadgeConfig {
  variant: BadgeVariant;
  label: string;
  icon?: string;
}

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './badge.component.html',
  styleUrls: ['./badge.component.scss']
})
export class BadgeComponent {
  config = input.required<BadgeConfig>();

  variant = computed(() => this.config().variant);
  label = computed(() => this.config().label);
  icon = computed(() => this.config().icon);
}
