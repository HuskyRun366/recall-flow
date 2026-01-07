import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LearningMaterialService } from '../../../core/services/learning-material.service';
import { MaterialParticipantService } from '../../../core/services/material-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ReviewService } from '../../../core/services/review.service';
import { LearningMaterial, MaterialParticipant, Review, User } from '../../../models';
import { StatCardComponent, BadgeComponent } from '../../../shared/components';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { ReviewDialogComponent, ReviewOptimisticChange } from '../../../shared/components/review-dialog/review-dialog.component';
import { FollowButtonComponent } from '../../../shared/components/follow-button/follow-button.component';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

type EnrollState = 'idle' | 'loading' | 'removing';

@Component({
  selector: 'app-material-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    StatCardComponent,
    BadgeComponent,
    StarRatingComponent,
    ReviewDialogComponent,
    FollowButtonComponent,
    PullToRefreshDirective
  ],
  templateUrl: './material-detail.component.html',
  styleUrls: ['./material-detail.component.scss']
})
export class MaterialDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materialService = inject(LearningMaterialService);
  private participantService = inject(MaterialParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);
  private reviewService = inject(ReviewService);

  material = signal<LearningMaterial | null>(null);
  coAuthors = signal<MaterialParticipant[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  materialAuthor = signal<User | null>(null);

  currentUser = this.authService.currentUser;
  isEnrolled = signal(false);
  enrollState = signal<EnrollState>('idle');
  canEdit = signal(false);
  copySuccess = signal(false);

  reviews = signal<Review[]>([]);
  userReview = signal<Review | null>(null);
  showReviewDialog = signal(false);
  isLoadingReviews = signal(false);

  requiresEnrollment = computed(() => {
    const m = this.material();
    const uid = this.currentUser()?.uid;
    if (!m || !uid) return false;
    if (m.ownerId === uid) return false;
    if (this.canEdit()) return false;
    return m.visibility === 'public';
  });

  canView = computed(() => {
    const m = this.material();
    if (!m) return false;
    if (m.visibility !== 'public') return true;
    if (this.canEdit()) return true;
    return this.isEnrolled();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Ungültige Material-ID');
      this.isLoading.set(false);
      return;
    }

    this.materialService.getMaterialById(id).subscribe({
      next: (m) => {
        if (!m) {
          this.error.set('Lernunterlage nicht gefunden');
          this.isLoading.set(false);
          return;
        }

        this.material.set(m);
        this.loadEnrollment(m.id);
        this.loadCoAuthors(m.id);
        this.loadReviews(m.id);
        this.loadAuthor(m.ownerId);

        const userId = this.currentUser()?.uid;
        if (userId) {
          this.checkCanEdit(m, userId);
        }

        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error(err);
        this.error.set('Fehler beim Laden');
        this.isLoading.set(false);
      }
    });
  }

  private loadEnrollment(materialId: string): void {
    const uid = this.currentUser()?.uid;
    if (!uid) return;
    this.participantService.getParticipant(materialId, uid).subscribe({
      next: (p) => {
        const enrolled = !!p && (p.role === 'student' || p.role === 'co-author');
        this.isEnrolled.set(enrolled);
        if (p?.role === 'co-author') {
          this.canEdit.set(true);
        }
      },
      error: (err) => console.error('Enrollment laden fehlgeschlagen', err)
    });
  }

  private loadCoAuthors(materialId: string): void {
    this.participantService.getParticipantsByMaterialId(materialId).subscribe({
      next: (participants) => {
        const coAuthors = participants.filter(p => p.role === 'co-author');
        this.coAuthors.set(coAuthors);
      },
      error: (err) => console.error('Co-Autoren laden fehlgeschlagen', err)
    });
  }

  private loadAuthor(ownerId: string): void {
    this.authService.getUserById(ownerId).subscribe({
      next: (user) => this.materialAuthor.set(user),
      error: (err) => console.error('Author laden fehlgeschlagen', err)
    });
  }

  private async checkCanEdit(material: LearningMaterial, userId: string): Promise<void> {
    if (material.ownerId === userId) {
      this.canEdit.set(true);
      return;
    }

    const isCoAuthor = await this.participantService.canEdit(material.id, userId);
    this.canEdit.set(isCoAuthor);
  }

  async enroll(): Promise<void> {
    const m = this.material();
    const user = this.currentUser();
    if (!m || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(true);
    this.enrollState.set('loading');
    try {
      await this.participantService.addParticipant(
        m.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );
      this.toastService.info(this.translateService.instant('toast.info.addedToLibrary'));
    } catch (err) {
      console.error('Enroll failed', err);
      this.isEnrolled.set(wasEnrolled);
      this.toastService.error(this.translateService.instant('toast.error.generic'));
    } finally {
      this.enrollState.set('idle');
    }
  }

  async unenroll(): Promise<void> {
    const m = this.material();
    const user = this.currentUser();
    if (!m || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(false);
    this.enrollState.set('removing');
    try {
      await this.participantService.removeParticipant(m.id, user.uid);
      this.toastService.info(this.translateService.instant('toast.info.removedFromLibrary'));
    } catch (err) {
      console.error('Unenroll failed', err);
      this.isEnrolled.set(wasEnrolled);
      this.toastService.error(this.translateService.instant('toast.error.generic'));
    } finally {
      this.enrollState.set('idle');
    }
  }

  viewMaterial(): void {
    const m = this.material();
    if (m) this.router.navigate(['/lernen/material', m.id, 'view']);
  }

  editMaterial(): void {
    const m = this.material();
    if (m) this.router.navigate(['/lernen/material-editor', m.id]);
  }

  copyJoinCode(): void {
    const code = this.material()?.joinCode;
    if (!code) return;

    navigator.clipboard.writeText(code).then(
      () => {
        this.copySuccess.set(true);
        this.toastService.success(this.translateService.instant('toast.success.copied'));
        setTimeout(() => this.copySuccess.set(false), 2000);
      },
      (err) => {
        console.error('Failed to copy join code:', err);
        this.toastService.error(this.translateService.instant('toast.error.generic'));
      }
    );
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  onRefresh(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.isLoading.set(true);
    this.error.set(null);

    this.materialService.getMaterialById(id).subscribe({
      next: (m) => {
        if (m) {
          this.material.set(m);
          this.loadEnrollment(id);
          this.loadCoAuthors(id);
          this.loadAuthor(m.ownerId);

          const userId = this.currentUser()?.uid;
          if (userId) {
            this.checkCanEdit(m, userId);
          }
        }
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error('Refresh error:', err);
        this.error.set('Fehler beim Aktualisieren');
        this.isLoading.set(false);
      }
    });
  }

  private loadReviews(materialId: string): void {
    this.isLoadingReviews.set(true);
    this.reviewService.getReviewsForContent(materialId, 'material').subscribe({
      next: (reviews: Review[]) => {
        this.reviews.set(reviews);
        const userId = this.currentUser()?.uid;
        if (userId) {
          const myReview = reviews.find((r: Review) => r.userId === userId);
          this.userReview.set(myReview || null);
        }
        this.isLoadingReviews.set(false);
      },
      error: (err: unknown) => {
        console.error('Failed to load reviews:', err);
        this.isLoadingReviews.set(false);
      }
    });
  }

  openReviewDialog(): void {
    this.showReviewDialog.set(true);
  }

  closeReviewDialog(): void {
    this.showReviewDialog.set(false);
  }

  onReviewOptimistic(change: ReviewOptimisticChange): void {
    const materialId = this.material()?.id;
    if (!materialId) return;

    if (change.rollback) {
      this.loadReviews(materialId);
      this.materialService.getMaterialById(materialId).subscribe({
        next: (m) => {
          if (m) this.material.set(m);
        }
      });
      return;
    }

    if (change.action === 'upsert' && change.review) {
      this.applyOptimisticReview(change.review, change.previous ?? null);
    } else if (change.action === 'delete') {
      this.applyOptimisticDelete(change);
    }
  }

  onReviewSubmitted(): void {
    const materialId = this.material()?.id;
    if (materialId) {
      this.loadReviews(materialId);
      this.materialService.getMaterialById(materialId).subscribe({
        next: (m) => {
          if (m) this.material.set(m);
        }
      });
    }
    this.closeReviewDialog();
  }

  private applyOptimisticReview(review: Review, previous: Review | null): void {
    this.reviews.update(reviews => {
      const filtered = reviews.filter(r => r.userId !== review.userId);
      return [review, ...filtered];
    });
    this.userReview.set(review);
    this.updateRatingSummary(review.rating, previous?.rating ?? null);
  }

  private applyOptimisticDelete(change: ReviewOptimisticChange): void {
    const previous = change.previous ?? null;
    const targetUserId = previous?.userId ?? null;
    const reviewId = change.reviewId ?? null;

    this.reviews.update(reviews =>
      reviews.filter(r => {
        if (targetUserId) return r.userId !== targetUserId;
        if (reviewId) return r.id !== reviewId;
        return true;
      })
    );

    if (targetUserId && this.userReview()?.userId === targetUserId) {
      this.userReview.set(null);
    }

    this.updateRatingSummary(null, previous?.rating ?? null);
  }

  private updateRatingSummary(newRating: number | null, previousRating: number | null): void {
    const m = this.material();
    if (!m) return;

    const currentCount = m.ratingCount ?? 0;
    const currentAverage = m.averageRating ?? 0;
    let nextCount = currentCount;
    let nextAverage = currentAverage;

    if (previousRating !== null && newRating !== null) {
      nextAverage = currentCount > 0
        ? (currentAverage * currentCount - previousRating + newRating) / currentCount
        : newRating;
    } else if (previousRating === null && newRating !== null) {
      nextCount = currentCount + 1;
      nextAverage = (currentAverage * currentCount + newRating) / nextCount;
    } else if (previousRating !== null && newRating === null) {
      nextCount = Math.max(0, currentCount - 1);
      nextAverage = nextCount > 0
        ? (currentAverage * currentCount - previousRating) / nextCount
        : 0;
    } else {
      return;
    }

    this.material.set({
      ...m,
      averageRating: nextAverage,
      ratingCount: nextCount
    });
  }
}
