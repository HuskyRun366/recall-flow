import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpdatesService } from '../../core/services/updates.service';
import { CHANGELOG } from '../../shared/data/changelog';

@Component({
  selector: 'app-updates',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './updates.component.html',
  styleUrls: ['./updates.component.scss']
})
export class UpdatesComponent implements OnInit {
  private updatesService = inject(UpdatesService);

  changelog = CHANGELOG;

  ngOnInit(): void {
    // Updates als gelesen markieren wenn Seite besucht wird
    this.updatesService.markAsRead();
  }

  getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      'feature': '✨',
      'bugfix': '🐛',
      'improvement': '⚡',
      'breaking': '💥'
    };
    return icons[type] || '📝';
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'feature': 'Neue Funktion',
      'bugfix': 'Bugfix',
      'improvement': 'Verbesserung',
      'breaking': 'Breaking Change'
    };
    return labels[type] || type;
  }

  getTypeClass(type: string): string {
    return `change-type-${type}`;
  }
}
