import { Component, input, output, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Review, ContentType } from '../../../models';
import { ReviewService } from '../../../core/services/review.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { StarRatingComponent } from '../star-rating/star-rating.component';

@Component({
  selector: 'app-review-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, StarRatingComponent],
  templateUrl: './review-dialog.component.html',
  styleUrls: ['./review-dialog.component.scss']
})
export class ReviewDialogComponent implements OnInit {
  private reviewService = inject(ReviewService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  contentId = input.required<string>();
  contentType = input.required<ContentType>();
  contentTitle = input<string>('');
  existingReview = input<Review | null>(null);

  close = output<void>();
  submitted = output<void>();

  rating = signal(0);
  comment = signal('');
  isSubmitting = signal(false);

  ngOnInit(): void {
    const existing = this.existingReview();
    if (existing) {
      this.rating.set(existing.rating);
      this.comment.set(existing.comment || '');
    }
  }

  onRatingChange(value: number): void {
    this.rating.set(value);
  }

  async submit(): Promise<void> {
    if (this.rating() === 0) {
      this.toastService.warning('Please select a rating');
      return;
    }

    this.isSubmitting.set(true);
    const user = this.authService.currentUser();

    if (!user) {
      this.toastService.error('You must be logged in to submit a review');
      this.isSubmitting.set(false);
      return;
    }

    try {
      await this.reviewService.submitReview(
        this.contentId(),
        this.contentType(),
        user.uid,
        user.displayName || 'Anonymous',
        user.photoURL || undefined,
        this.rating(),
        this.comment() || undefined
      );

      this.toastService.success('discover.rating.thankYou');
      this.submitted.emit();
      this.close.emit();
    } catch (error) {
      console.error('Failed to submit review:', error);
      this.toastService.error('Failed to submit review');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      this.onClose();
    }
  }
}
