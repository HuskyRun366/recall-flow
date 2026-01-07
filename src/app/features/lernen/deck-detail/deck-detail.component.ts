import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ReviewService } from '../../../core/services/review.service';
import { FlashcardDeck, Flashcard, CardProgress, DeckParticipant, Review, User } from '../../../models';
import { StatCardComponent, BadgeComponent, LevelBadgeComponent } from '../../../shared/components';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { ReviewDialogComponent, ReviewOptimisticChange } from '../../../shared/components/review-dialog/review-dialog.component';
import { FollowButtonComponent } from '../../../shared/components/follow-button/follow-button.component';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type EnrollState = 'idle' | 'loading' | 'removing';

interface FlashcardWithProgress {
  flashcard: Flashcard;
  progress?: CardProgress;
}

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StatCardComponent, BadgeComponent, LevelBadgeComponent, PullToRefreshDirective, StarRatingComponent, ReviewDialogComponent, FollowButtonComponent],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss']
})
export class DeckDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private deckService = inject(FlashcardDeckService);
  private flashcardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private participantService = inject(DeckParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);
  private reviewService = inject(ReviewService);

  deck = signal<FlashcardDeck | null>(null);
  flashcards = signal<FlashcardWithProgress[]>([]);
  coAuthors = signal<DeckParticipant[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  deckAuthor = signal<User | null>(null);

  currentUser = this.authService.currentUser;
  isEnrolled = signal(false);
  enrollState = signal<EnrollState>('idle');
  canEdit = signal(false);
  copySuccess = signal(false);
  exportSuccess = signal(false);

  // Review-related signals
  reviews = signal<Review[]>([]);
  userReview = signal<Review | null>(null);
  showReviewDialog = signal(false);
  isLoadingReviews = signal(false);

  requiresEnrollment = computed(() => {
    const d = this.deck();
    const uid = this.currentUser()?.uid;
    if (!d || !uid) return false;
    if (d.ownerId === uid) return false;
    return d.visibility === 'public';
  });

  canStudy = computed(() => {
    if (this.deck()?.visibility !== 'public') return true;
    if (this.canEdit()) return true;
    return this.isEnrolled();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Ungültige Deck-ID');
      this.isLoading.set(false);
      return;
    }

    this.deckService.getDeckById(id).subscribe({
      next: (d) => {
        if (!d) {
          this.error.set('Deck nicht gefunden');
          this.isLoading.set(false);
          return;
        }
        this.deck.set(d);
        this.loadFlashcards(id);
        this.loadEnrollment(id);
        this.loadCoAuthors(id);
        this.loadReviews(id);
        this.loadAuthor(d.ownerId);

        // Check edit permission
        const userId = this.currentUser()?.uid;
        if (userId) {
          this.checkCanEdit(d, userId);
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

  private loadFlashcards(deckId: string): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      // Load flashcards without progress
      this.flashcardService.getFlashcardsByDeckId(deckId).subscribe({
        next: (cards: Flashcard[]) => {
          const cardsWithProgress = cards.map(card => ({
            flashcard: card,
            progress: undefined
          }));
          this.flashcards.set(cardsWithProgress);
        },
        error: (err: unknown) => console.error('Karten laden fehlgeschlagen', err)
      });
      return;
    }

    // Load flashcards with progress
    forkJoin([
      this.flashcardService.getFlashcardsByDeckId(deckId),
      this.progressService.getCardProgress(deckId, userId).pipe(
        catchError(() => of([]))
      )
    ]).subscribe({
      next: ([cards, progressArray]) => {
        const progressMap = new Map<string, CardProgress>();
        progressArray.forEach(p => progressMap.set(p.cardId, p));

        const cardsWithProgress = cards.map(card => ({
          flashcard: card,
          progress: progressMap.get(card.id!)
        }));
        this.flashcards.set(cardsWithProgress);
      },
      error: (err: unknown) => console.error('Karten laden fehlgeschlagen', err)
    });
  }

  private loadEnrollment(deckId: string): void {
    const uid = this.currentUser()?.uid;
    if (!uid) return;
    this.participantService.getParticipant(deckId, uid).subscribe({
      next: (p) => this.isEnrolled.set(!!p && (p.role === 'student' || p.role === 'co-author')),
      error: (err) => console.error('Enrollment laden fehlgeschlagen', err)
    });
  }

  private loadCoAuthors(deckId: string): void {
    this.participantService.getParticipantsByDeckId(deckId).subscribe({
      next: (participants) => {
        const coAuthors = participants.filter(p => p.role === 'co-author');
        this.coAuthors.set(coAuthors);
      },
      error: (err) => console.error('Co-Autoren laden fehlgeschlagen', err)
    });
  }

  private loadAuthor(ownerId: string): void {
    this.authService.getUserById(ownerId).subscribe({
      next: (user) => this.deckAuthor.set(user),
      error: (err) => console.error('Author laden fehlgeschlagen', err)
    });
  }

  private async checkCanEdit(deck: FlashcardDeck, userId: string): Promise<void> {
    if (deck.ownerId === userId) {
      this.canEdit.set(true);
      return;
    }

    // Check if user is co-author
    const isCoAuthor = await this.participantService.canEdit(deck.id, userId);
    this.canEdit.set(isCoAuthor);
  }

  async enroll(): Promise<void> {
    const d = this.deck();
    const user = this.currentUser();
    if (!d || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(true);
    this.enrollState.set('loading');
    try {
      await this.participantService.addParticipant(
        d.id,
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
    const d = this.deck();
    const user = this.currentUser();
    if (!d || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(false);
    this.enrollState.set('removing');
    try {
      await this.participantService.removeParticipant(d.id, user.uid);
      this.toastService.info(this.translateService.instant('toast.info.removedFromLibrary'));
    } catch (err) {
      console.error('Unenroll failed', err);
      this.isEnrolled.set(wasEnrolled);
      this.toastService.error(this.translateService.instant('toast.error.generic'));
    } finally {
      this.enrollState.set('idle');
    }
  }

  startStudy(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/lernen/deck', d.id, 'study']);
  }

  editDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/lernen/deck-editor', d.id]);
  }

  copyJoinCode(): void {
    const code = this.deck()?.joinCode;
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

  private formatDeckForExport(deck: FlashcardDeck, flashcards: FlashcardWithProgress[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`DECK: ${deck.title}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Metadata
    if (deck.description) {
      lines.push(`Beschreibung: ${deck.description}`);
    }
    lines.push(`Sichtbarkeit: ${deck.visibility}`);
    lines.push(`Anzahl Karten: ${flashcards.length}`);
    if (deck.tags && deck.tags.length > 0) {
      lines.push(`Tags: ${deck.tags.join(', ')}`);
    }
    lines.push('');
    lines.push('='.repeat(80));

    // Flashcards
    flashcards.forEach((item, index) => {
      const card = item.flashcard;
      const progress = item.progress;

      lines.push('');
      lines.push(`Karte ${index + 1}`);
      lines.push('');
      lines.push(`Vorderseite: ${card.front}`);
      lines.push(`Rückseite: ${card.back}`);

      if (progress) {
        const levelLabels = ['Nicht trainiert', '1x trainiert', '2x trainiert', 'Perfekt trainiert'];
        lines.push(`Fortschritt: ${levelLabels[progress.level]}`);
      }

      // Separator between cards
      if (index < flashcards.length - 1) {
        lines.push('');
        lines.push('-'.repeat(80));
      }
    });

    // Footer
    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  exportDeck(): void {
    const d = this.deck();
    const cards = this.flashcards();
    if (!d || !cards) return;

    // Menschenlesbaren Export generieren
    const exportContent = this.formatDeckForExport(d, cards);

    // Blob erstellen
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });

    // Download-Link erstellen
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Dateiname: deck-title.txt (Sonderzeichen entfernen)
    const safeTitle = d.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-');
    link.download = `${safeTitle}.txt`;

    // Download triggern
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // Success-Feedback (2 Sekunden)
    this.exportSuccess.set(true);
    setTimeout(() => this.exportSuccess.set(false), 2000);
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

    this.deckService.getDeckById(id).subscribe({
      next: (d) => {
        if (d) {
          this.deck.set(d);
          this.loadFlashcards(id);
          this.loadEnrollment(id);
          this.loadCoAuthors(id);
          this.loadAuthor(d.ownerId);

          const userId = this.currentUser()?.uid;
          if (userId) {
            this.checkCanEdit(d, userId);
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

  // Review methods
  private loadReviews(deckId: string): void {
    this.isLoadingReviews.set(true);
    this.reviewService.getReviewsForContent(deckId, 'deck').subscribe({
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
    const deckId = this.deck()?.id;
    if (!deckId) return;

    if (change.rollback) {
      this.loadReviews(deckId);
      this.deckService.getDeckById(deckId).subscribe({
        next: (d) => {
          if (d) this.deck.set(d);
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
    const deckId = this.deck()?.id;
    if (deckId) {
      this.loadReviews(deckId);
      // Reload deck to get updated averageRating
      this.deckService.getDeckById(deckId).subscribe({
        next: (d) => {
          if (d) this.deck.set(d);
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
    const d = this.deck();
    if (!d) return;

    const currentCount = d.ratingCount ?? 0;
    const currentAverage = d.averageRating ?? 0;
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

    this.deck.set({
      ...d,
      averageRating: nextAverage,
      ratingCount: nextCount
    });
  }
}
