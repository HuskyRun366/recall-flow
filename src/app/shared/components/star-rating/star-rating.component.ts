import { Component, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './star-rating.component.html',
  styleUrls: ['./star-rating.component.scss']
})
export class StarRatingComponent {
  rating = input<number>(0);
  count = input<number | null>(null);
  editable = input<boolean>(false);
  size = input<'sm' | 'md' | 'lg'>('md');
  showCount = input<boolean>(true);

  ratingChange = output<number>();

  hoverRating = signal<number>(0);

  stars = computed(() => {
    const currentRating = this.hoverRating() || this.rating();
    return [1, 2, 3, 4, 5].map(i => ({
      value: i,
      filled: i <= Math.floor(currentRating),
      half: !this.editable() && i === Math.ceil(currentRating) && currentRating % 1 >= 0.25 && currentRating % 1 < 0.75,
      empty: i > Math.ceil(currentRating) || (i === Math.ceil(currentRating) && currentRating % 1 < 0.25)
    }));
  });

  displayRating = computed(() => {
    const r = this.rating();
    return r > 0 ? r.toFixed(1) : '-';
  });

  onStarClick(value: number): void {
    if (this.editable()) {
      this.ratingChange.emit(value);
    }
  }

  onStarHover(value: number): void {
    if (this.editable()) {
      this.hoverRating.set(value);
    }
  }

  onStarLeave(): void {
    if (this.editable()) {
      this.hoverRating.set(0);
    }
  }
}
