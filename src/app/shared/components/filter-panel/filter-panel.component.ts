import { Component, model, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ContentCategory, DifficultyLevel } from '../../../models';
import { ContentType } from '../../../models/review.model';

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.scss']
})
export class FilterPanelComponent {
  contentType = model<ContentType | 'all'>('all');
  category = model<ContentCategory | null>(null);
  difficulty = model<DifficultyLevel | null>(null);
  language = model<string | null>(null);

  filterChange = output<void>();

  isExpanded = signal(false);

  categories: ContentCategory[] = [
    'math', 'science', 'languages', 'history',
    'geography', 'technology', 'arts', 'business', 'health', 'other'
  ];

  difficulties: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced'];

  languages = [
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Espanol' },
    { code: 'fr', label: 'Francais' }
  ];

  contentTypes: Array<{ value: ContentType | 'all'; label: string }> = [
    { value: 'all', label: 'discover.contentTypes.all' },
    { value: 'quiz', label: 'discover.contentTypes.quiz' },
    { value: 'deck', label: 'discover.contentTypes.deck' },
    { value: 'material', label: 'discover.contentTypes.material' },
    { value: 'theme', label: 'discover.contentTypes.theme' }
  ];

  hasActiveFilters(): boolean {
    return this.category() !== null ||
           this.difficulty() !== null ||
           this.language() !== null ||
           this.contentType() !== 'all';
  }

  activeFilterCount(): number {
    let count = 0;
    if (this.category()) count++;
    if (this.difficulty()) count++;
    if (this.language()) count++;
    if (this.contentType() !== 'all') count++;
    return count;
  }

  clearFilters(): void {
    this.contentType.set('all');
    this.category.set(null);
    this.difficulty.set(null);
    this.language.set(null);
    this.filterChange.emit();
  }

  onFilterChange(): void {
    this.filterChange.emit();
  }

  toggleExpanded(): void {
    this.isExpanded.update(v => !v);
  }
}
