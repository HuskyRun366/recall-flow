import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.scss']
})
export class SearchBarComponent {
  placeholder = input('Suchen...');
  ariaLabel = input('Suche');
  showResultCount = input(true);
  searchTerm = input.required<string>();
  resultCount = input.required<number>();

  searchChange = output<string>();
  clear = output<void>();

  hasSearchTerm = computed(() => this.searchTerm().trim().length > 0);

  onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchChange.emit(value);
  }

  onClear(): void {
    this.clear.emit();
  }
}
