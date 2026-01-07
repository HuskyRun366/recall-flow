import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FirestoreService } from '../../../core/services/firestore.service';
import { QuestionService } from '../../../core/services/question.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ReviewService } from '../../../core/services/review.service';
import { FollowService } from '../../../core/services/follow.service';
import { Quiz, Question, Review, User } from '../../../models';
import { StatCardComponent } from '../../../shared/components';
import { StarRatingComponent } from '../../../shared/components/star-rating/star-rating.component';
import { ReviewDialogComponent, ReviewOptimisticChange } from '../../../shared/components/review-dialog/review-dialog.component';
import { FollowButtonComponent } from '../../../shared/components/follow-button/follow-button.component';

type EnrollState = 'idle' | 'loading' | 'removing';

@Component({
  selector: 'app-quiz-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StatCardComponent, StarRatingComponent, ReviewDialogComponent, FollowButtonComponent],
  templateUrl: './quiz-detail.component.html',
  styleUrls: ['./quiz-detail.component.scss']
})
export class QuizDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);
  private reviewService = inject(ReviewService);
  private followService = inject(FollowService);

  quiz = signal<Quiz | null>(null);
  questions = signal<Question[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;
  isEnrolled = signal(false);
  enrollState = signal<EnrollState>('idle');
  canEdit = signal(false);
  copySuccess = signal(false);
  exportSuccess = signal(false);

  // Author-related signals
  quizAuthor = signal<User | null>(null);

  // Review-related signals
  reviews = signal<Review[]>([]);
  userReview = signal<Review | null>(null);
  showReviewDialog = signal(false);
  isLoadingReviews = signal(false);

  requiresEnrollment = computed(() => {
    const q = this.quiz();
    const uid = this.currentUser()?.uid;
    if (!q || !uid) return false;
    if (q.ownerId === uid) return false;
    return q.visibility === 'public';
  });

  canPlay = computed(() => {
    if (this.quiz()?.visibility !== 'public') return true;
    if (this.canEdit()) return true;
    return this.isEnrolled();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Ungültige Quiz-ID');
      this.isLoading.set(false);
      return;
    }

    this.firestoreService.getQuizById(id).subscribe({
      next: (q) => {
        if (!q) {
          this.error.set('Quiz nicht gefunden');
          this.isLoading.set(false);
          return;
        }
        this.quiz.set(q);
        this.loadQuestions(id);
        this.loadEnrollment(id);
        this.loadReviews(id);
        this.loadAuthor(q.ownerId);

        // Check edit permission
        const userId = this.currentUser()?.uid;
        if (userId) {
          this.checkCanEdit(q, userId);
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

  private loadQuestions(quizId: string): void {
    this.questionService.getQuestionsByQuizId(quizId).subscribe({
      next: (qs: Question[]) => this.questions.set(qs),
      error: (err: unknown) => console.error('Fragen laden fehlgeschlagen', err)
    });
  }

  private loadEnrollment(quizId: string): void {
    const uid = this.currentUser()?.uid;
    if (!uid) return;
    this.participantService.getParticipant(quizId, uid).subscribe({
      next: (p) => this.isEnrolled.set(!!p && (p.role === 'participant' || p.role === 'co-author')),
      error: (err) => console.error('Enrollment laden fehlgeschlagen', err)
    });
  }

  private loadAuthor(ownerId: string): void {
    this.authService.getUserById(ownerId).subscribe({
      next: (user) => this.quizAuthor.set(user),
      error: (err) => console.error('Author laden fehlgeschlagen', err)
    });
  }

  private async checkCanEdit(quiz: Quiz, userId: string): Promise<void> {
    if (quiz.ownerId === userId) {
      this.canEdit.set(true);
      return;
    }

    // Check if user is co-author
    const isCoAuthor = await this.participantService.canEdit(quiz.id, userId);
    this.canEdit.set(isCoAuthor);
  }

  async enroll(): Promise<void> {
    const q = this.quiz();
    const user = this.currentUser();
    if (!q || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(true);
    this.enrollState.set('loading');
    try {
      await this.participantService.addParticipant(
        q.id,
        user.uid,
        user.email || '',
        'participant',
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
    const q = this.quiz();
    const user = this.currentUser();
    if (!q || !user || this.enrollState() !== 'idle') return;

    const wasEnrolled = this.isEnrolled();
    // Optimistic UI update
    this.isEnrolled.set(false);
    this.enrollState.set('removing');
    try {
      await this.participantService.removeParticipant(q.id, user.uid);
      this.toastService.info(this.translateService.instant('toast.info.removedFromLibrary'));
    } catch (err) {
      console.error('Unenroll failed', err);
      this.isEnrolled.set(wasEnrolled);
      this.toastService.error(this.translateService.instant('toast.error.generic'));
    } finally {
      this.enrollState.set('idle');
    }
  }

  startQuiz(): void {
    const q = this.quiz();
    if (q) this.router.navigate(['/quiz', q.id, 'take']);
  }

  editQuiz(): void {
    const q = this.quiz();
    if (q) this.router.navigate(['/quiz', 'editor', q.id]);
  }

  copyJoinCode(): void {
    const code = this.quiz()?.joinCode;
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

  private formatQuizForExport(quiz: Quiz, questions: Question[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`QUIZ: ${quiz.title}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Metadata
    if (quiz.description) {
      lines.push(`Beschreibung: ${quiz.description}`);
    }
    lines.push(`Sichtbarkeit: ${quiz.visibility}`);
    lines.push(`Anzahl Fragen: ${questions.length}`);
    lines.push('');
    lines.push('='.repeat(80));

    // Questions
    questions.forEach((question, index) => {
      lines.push('');
      lines.push(`Frage ${index + 1}: ${question.questionText}`);

      // Question type label
      const typeLabels: Record<string, string> = {
        'multiple-choice': 'Multiple-Choice',
        'ordering': 'Reihenfolge',
        'matching': 'Zuordnung'
      };
      lines.push(`Typ: ${typeLabels[question.type] || question.type}`);
      lines.push('');

      // Format based on question type
      if (question.type === 'multiple-choice' && question.options) {
        question.options.forEach(option => {
          const marker = option.isCorrect ? '✓' : '✗';
          const label = option.isCorrect ? ' (korrekt)' : '';
          lines.push(`  ${marker} ${option.text}${label}`);
        });
      } else if (question.type === 'ordering' && question.orderItems) {
        // Sort by correctOrder
        const sorted = [...question.orderItems].sort((a, b) => a.correctOrder - b.correctOrder);
        sorted.forEach((item, i) => {
          lines.push(`  ${i + 1}. ${item.text}`);
        });
      } else if (question.type === 'matching' && question.matchingPairs && question.matchingChoices) {
        question.matchingPairs.forEach(pair => {
          const choice = question.matchingChoices?.find(c => c.id === pair.correctChoiceId);
          if (choice) {
            lines.push(`  ${pair.leftText} → ${choice.text}`);
          }
        });
      }

      // Separator between questions
      if (index < questions.length - 1) {
        lines.push('');
        lines.push('-'.repeat(80));
      }
    });

    // Footer
    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  exportQuiz(): void {
    const q = this.quiz();
    const qs = this.questions();
    if (!q || !qs) return;

    // Menschenlesbaren Export generieren
    const exportContent = this.formatQuizForExport(q, qs);

    // Blob erstellen
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });

    // Download-Link erstellen
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Dateiname: quiz-title.txt (Sonderzeichen entfernen)
    const safeTitle = q.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-');
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

  // Review methods
  private loadReviews(quizId: string): void {
    this.isLoadingReviews.set(true);
    this.reviewService.getReviewsForContent(quizId, 'quiz').subscribe({
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
    const quizId = this.quiz()?.id;
    if (!quizId) return;

    if (change.rollback) {
      this.loadReviews(quizId);
      this.firestoreService.getQuizById(quizId).subscribe({
        next: (q) => {
          if (q) this.quiz.set(q);
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
    const quizId = this.quiz()?.id;
    if (quizId) {
      this.loadReviews(quizId);
      // Reload quiz to get updated averageRating
      this.firestoreService.getQuizById(quizId).subscribe({
        next: (q) => {
          if (q) this.quiz.set(q);
        }
      });
    }
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
    const q = this.quiz();
    if (!q) return;

    const currentCount = q.ratingCount ?? 0;
    const currentAverage = q.averageRating ?? 0;
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

    this.quiz.set({
      ...q,
      averageRating: nextAverage,
      ratingCount: nextCount
    });
  }
}
