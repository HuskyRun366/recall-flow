import { Component, input, output, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './tag-input.component.html',
  styleUrls: ['./tag-input.component.scss']
})
export class TagInputComponent {
  @ViewChild('inputField') inputField!: ElementRef<HTMLInputElement>;

  tags = input<string[]>([]);
  suggestions = input<string[]>([]);
  placeholder = input<string>('tags.addTag');
  maxTags = input<number>(10);
  disabled = input<boolean>(false);

  tagsChange = output<string[]>();

  inputValue = signal('');
  isFocused = signal(false);
  selectedSuggestionIndex = signal(-1);

  filteredSuggestions = computed(() => {
    const value = this.inputValue().toLowerCase().trim();
    const currentTags = this.tags();

    if (!value) return [];

    return this.suggestions()
      .filter(s =>
        s.toLowerCase().includes(value) &&
        !currentTags.includes(s)
      )
      .slice(0, 5);
  });

  showSuggestions = computed(() =>
    this.isFocused() &&
    this.filteredSuggestions().length > 0
  );

  onInputChange(value: string): void {
    this.inputValue.set(value);
    this.selectedSuggestionIndex.set(-1);
  }

  onKeyDown(event: KeyboardEvent): void {
    const suggestions = this.filteredSuggestions();

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex() >= 0 && suggestions.length > 0) {
          this.addTag(suggestions[this.selectedSuggestionIndex()]);
        } else if (this.inputValue().trim()) {
          this.addTag(this.inputValue().trim());
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (suggestions.length > 0) {
          const newIndex = Math.min(
            this.selectedSuggestionIndex() + 1,
            suggestions.length - 1
          );
          this.selectedSuggestionIndex.set(newIndex);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (suggestions.length > 0) {
          const newIndex = Math.max(this.selectedSuggestionIndex() - 1, -1);
          this.selectedSuggestionIndex.set(newIndex);
        }
        break;

      case 'Escape':
        this.isFocused.set(false);
        break;

      case 'Backspace':
        if (!this.inputValue() && this.tags().length > 0) {
          this.removeTag(this.tags()[this.tags().length - 1]);
        }
        break;
    }
  }

  addTag(tag: string): void {
    const normalizedTag = tag.trim().toLowerCase();
    if (
      !normalizedTag ||
      this.tags().includes(normalizedTag) ||
      this.tags().length >= this.maxTags()
    ) {
      return;
    }

    this.tagsChange.emit([...this.tags(), normalizedTag]);
    this.inputValue.set('');
    this.selectedSuggestionIndex.set(-1);
  }

  removeTag(tag: string): void {
    this.tagsChange.emit(this.tags().filter(t => t !== tag));
  }

  selectSuggestion(suggestion: string): void {
    this.addTag(suggestion);
    this.inputField?.nativeElement?.focus();
  }

  onFocus(): void {
    this.isFocused.set(true);
  }

  onBlur(): void {
    // Delay to allow click on suggestion
    setTimeout(() => {
      this.isFocused.set(false);
    }, 200);
  }
}
