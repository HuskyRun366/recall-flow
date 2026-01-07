import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-favorite-button',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './favorite-button.component.html',
  styleUrls: ['./favorite-button.component.scss']
})
export class FavoriteButtonComponent {
  isFavorite = input<boolean>(false);
  size = input<'small' | 'medium' | 'large'>('medium');
  disabled = input<boolean>(false);

  favoriteChange = output<boolean>();

  iconSize = computed(() => {
    switch (this.size()) {
      case 'small': return 16;
      case 'large': return 24;
      default: return 20;
    }
  });

  toggle(): void {
    if (!this.disabled()) {
      this.favoriteChange.emit(!this.isFavorite());
    }
  }
}
