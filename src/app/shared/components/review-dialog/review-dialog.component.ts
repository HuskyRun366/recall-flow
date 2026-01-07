import { Component, input, output, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Review, ContentType } from '../../../models';
import { ReviewService } from '../../../core/services/review.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { StarRatingComponent } from '../star-rating/star-rating.component';

export type ReviewOptimisticChange = {
  action: 'upsert' | 'delete';
  review?: Review;
  reviewId?: string;
  previous?: Review | null;
  rollback?: boolean;
};

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
  private translateService = inject(TranslateService);

  contentId = input.required<string>();
  contentType = input.required<ContentType>();
  contentTitle = input<string>('');
  existingReview = input<Review | null>(null);

  close = output<void>();
  submitted = output<void>();
  optimisticChange = output<ReviewOptimisticChange>();

  rating = signal(0);
  comment = signal('');
  isSubmitting = signal(false);
  isDeleting = signal(false);

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

    const existing = this.existingReview();
    const now = new Date();
    const optimisticReview: Review = {
      id: existing?.id ?? `optimistic-${Date.now()}`,
      contentId: this.contentId(),
      contentType: this.contentType(),
      userId: user.uid,
      userDisplayName: user.displayName || 'Anonymous',
      userPhotoUrl: user.photoURL || undefined,
      rating: this.rating(),
      comment: this.comment() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    // Optimistic UI update
    this.optimisticChange.emit({
      action: 'upsert',
      review: optimisticReview,
      previous: existing ?? null
    });
    this.close.emit();

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

      this.toastService.success(this.translateService.instant('discover.rating.thankYou'));
      this.submitted.emit();
    } catch (error) {
      console.error('Failed to submit review:', error);
      this.toastService.error('Failed to submit review');
      this.optimisticChange.emit({
        action: 'upsert',
        review: optimisticReview,
        previous: existing ?? null,
        rollback: true
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async deleteReview(): Promise<void> {
    const existing = this.existingReview();
    if (!existing) return;

    const confirmed = confirm(this.translateService.instant('discover.rating.deleteConfirm'));
    if (!confirmed) return;

    this.isDeleting.set(true);

    try {
      // Optimistic UI update
      this.optimisticChange.emit({
        action: 'delete',
        reviewId: existing.id,
        previous: existing
      });
      this.close.emit();

      await this.reviewService.deleteReview(
        existing.id,
        this.contentId(),
        this.contentType()
      );

      this.toastService.success('discover.rating.deleted');
      this.submitted.emit();
    } catch (error) {
      console.error('Failed to delete review:', error);
      this.toastService.error('Failed to delete review');
      this.optimisticChange.emit({
        action: 'delete',
        reviewId: existing.id,
        previous: existing,
        rollback: true
      });
    } finally {
      this.isDeleting.set(false);
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
