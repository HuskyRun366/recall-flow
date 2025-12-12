import { Component, input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export interface StatCardConfig {
  icon: 'svg' | 'emoji';
  iconContent: string;
  value: string | number;
  label: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'total';
  ariaLabel?: string;
}

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-card.component.html',
  styleUrls: ['./stat-card.component.scss']
})
export class StatCardComponent {
  private sanitizer = inject(DomSanitizer);

  config = input.required<StatCardConfig>();

  icon = computed(() => this.config().icon);
  iconContent = computed(() => this.config().iconContent);
  safeIconContent = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.config().iconContent)
  );
  value = computed(() => this.config().value);
  label = computed(() => this.config().label);
  variant = computed(() => this.config().variant || 'default');
  ariaLabel = computed(() => this.config().ariaLabel || this.config().label);
}
