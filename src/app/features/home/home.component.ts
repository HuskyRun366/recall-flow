import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FirestoreService } from '../../core/services/firestore.service';
import { ProgressService } from '../../core/services/progress.service';
import { ParticipantService } from '../../core/services/participant.service';
import { AuthService } from '../../core/services/auth.service';
import { OfflinePreloadService } from '../../core/services/offline-preload.service';
import { PwaDetectionService } from '../../core/services/pwa-detection.service';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, StatCardConfig } from '../../shared/components';
import { Quiz, ProgressSummary, UserQuizReference } from '../../models';
import { combineLatest, forkJoin, of, Observable, timeout, from } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

interface QuizWithProgress {
  quiz: Quiz;
  progress: ProgressSummary;
  totalQuestions: number;
  userCanEdit?: boolean;
  isOfflineAvailable?: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, SkeletonLoaderComponent, StatCardComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private firestoreService = inject(FirestoreService);
  private progressService = inject(ProgressService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private pwaDetection = inject(PwaDetectionService);
  private destroyRef = inject(DestroyRef);

  quizzesWithProgress = signal<QuizWithProgress[]>([]);
  userQuizRefs = signal<UserQuizReference[]>([]);
  userQuizRoleMap = signal<Map<string, UserQuizReference['role']>>(new Map());
  searchTerm = signal('');
  fabOpen = signal(false);
  filteredQuizzes = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const list = this.quizzesWithProgress();
    if (!term) return list;

    return list.filter(item => {
      const title = (item.quiz.title || '').toLowerCase();
      const desc = (item.quiz.description || '').toLowerCase();
      return title.includes(term) || desc.includes(term);
    });
  });
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;

  // Keep isPWA for the offline availability badge
  isPWA = this.pwaDetection.isPWA;

  // Computed statistics
  totalQuizzes = computed(() => this.quizzesWithProgress().length);
  totalQuestions = computed(() =>
    this.quizzesWithProgress().reduce((sum, qwp) => sum + qwp.totalQuestions, 0)
  );

  overallProgress = computed(() => {
    const quizzes = this.quizzesWithProgress();
    if (quizzes.length === 0) return 0;

    const totalQs = quizzes.reduce((sum, qwp) => sum + qwp.totalQuestions, 0);
    if (totalQs === 0) return 0;

    const trainedQs = quizzes.reduce(
      (sum, qwp) => sum + qwp.progress.onceTrained + qwp.progress.twiceTrained * 2 + qwp.progress.perfectlyTrained * 3,
      0
    );

    return Math.round((trainedQs / (totalQs * 3)) * 100);
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    // Load quizzes using proper RxJS chain with takeUntilDestroyed
    combineLatest([
      this.participantService.getUserQuizzes(userId),
      this.firestoreService.getQuizzesForUser(userId)
    ]).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(([userQuizRefs, ownedQuizzes]) => {
        this.userQuizRefs.set(userQuizRefs);
        const roleMap = new Map<string, UserQuizReference['role']>();
        userQuizRefs.forEach(ref => roleMap.set(ref.quizId, ref.role));
        this.userQuizRoleMap.set(roleMap);

        const userQuizIds = userQuizRefs.map(ref => ref.quizId);

        // Fetch Quiz objects for user references using batch query
        // This reduces N individual reads to 1 query (or ceil(N/30) for larger lists)
        const userQuizzes$ = userQuizIds.length > 0
          ? this.firestoreService.getQuizzesByIds(userQuizIds).pipe(
              catchError(() => of([] as Quiz[]))
            )
          : of([] as Quiz[]);

        return userQuizzes$.pipe(
          map(userQuizzes => {
            return this.deduplicateQuizzes([...userQuizzes, ...ownedQuizzes]);
          })
        );
      }),
      switchMap(allQuizzes => this.loadProgressForQuizzes(allQuizzes, userId))
    ).subscribe({
      next: (quizzesWithProgress) => {
        this.quizzesWithProgress.set(quizzesWithProgress);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading quizzes:', err);
        this.error.set('Failed to load quizzes. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private deduplicateQuizzes(quizzes: Quiz[]): Quiz[] {
    const uniqueMap = new Map<string, Quiz>();
    quizzes.forEach(quiz => {
      if (!uniqueMap.has(quiz.id)) {
        uniqueMap.set(quiz.id, quiz);
      }
    });
    return Array.from(uniqueMap.values());
  }

  private loadProgressForQuizzes(quizzes: Quiz[], userId: string) {
    if (quizzes.length === 0) {
      return of([] as QuizWithProgress[]);
    }

    const progressObservables = quizzes.map(quiz =>
      this.progressService.getProgressSummary(quiz.id, userId).pipe(
        catchError(() => of({
          notTrained: quiz.questionCount,
          onceTrained: 0,
          twiceTrained: 0,
          perfectlyTrained: 0
        }))
      )
    );

    return forkJoin(progressObservables).pipe(
      timeout(10000),  // 10 seconds timeout for all progress queries
      catchError(error => {
        console.error('Error loading progress:', error);
        // Fallback: Return quizzes without progress
        return of(quizzes.map(quiz => ({
          notTrained: quiz.questionCount,
          onceTrained: 0,
          twiceTrained: 0,
          perfectlyTrained: 0
        })));
      }),
      switchMap(progressSummaries => {
        const quizzesWithProgress: QuizWithProgress[] = quizzes.map((quiz, index) => {
          const raw = progressSummaries[index] || {
            notTrained: quiz.questionCount,
            onceTrained: 0,
            twiceTrained: 0,
            perfectlyTrained: 0
          };

          const capped = this.capSummaryToQuestionCount(raw, quiz.questionCount);
          const normalized = this.normalizeSummary(capped, quiz.questionCount);
          const completed = this.fillMissingWithNotTrained(normalized, quiz.questionCount);

          return {
            quiz,
            progress: completed,
            totalQuestions: quiz.questionCount,
            userCanEdit: false  // Will be set by checkEditPermissions
          };
        });

        return this.checkEditPermissions(quizzesWithProgress, userId);
      }),
      map(quizzesWithProgress => {
        // Sort by update date
        quizzesWithProgress.sort((a, b) =>
          b.quiz.updatedAt.getTime() - a.quiz.updatedAt.getTime()
        );
        return quizzesWithProgress;
      }),
      catchError(error => {
        console.error('Error in quiz loading chain:', error);
        // Return quizzes with default progress on error
        const quizzesWithProgress: QuizWithProgress[] = quizzes.map(quiz => ({
          quiz,
          progress: {
            notTrained: quiz.questionCount,
            onceTrained: 0,
            twiceTrained: 0,
            perfectlyTrained: 0
          },
          totalQuestions: quiz.questionCount,
          userCanEdit: false
        }));
        return of(quizzesWithProgress);
      })
    );
  }

  /**
   * Cap progress summary to the quiz's current question count to avoid stale progress entries
   * (e.g., deleted questions that still exist in progress collection).
   */
  private capSummaryToQuestionCount(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total <= questionCount) return summary;

    let excess = total - questionCount;
    const capped: ProgressSummary = { ...summary };

    // Remove from lowest-impact buckets first
    const reduceBucket = (key: keyof ProgressSummary) => {
      const remove = Math.min(excess, capped[key]);
      capped[key] -= remove;
      excess -= remove;
    };

    reduceBucket('notTrained');
    if (excess > 0) reduceBucket('onceTrained');
    if (excess > 0) reduceBucket('twiceTrained');
    if (excess > 0) reduceBucket('perfectlyTrained');

    return capped;
  }

  private normalizeSummary(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total === 0) {
      return {
        notTrained: questionCount,
        onceTrained: 0,
        twiceTrained: 0,
        perfectlyTrained: 0
      };
    }
    return summary;
  }

  // If progress totals are less than questionCount, put the remainder into notTrained
  private fillMissingWithNotTrained(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total >= questionCount) return summary;

    const missing = questionCount - total;
    return {
      ...summary,
      notTrained: summary.notTrained + missing
    };
  }

  getProgressPercentage(progress: ProgressSummary, level: number): number {
    const total = progress.notTrained + progress.onceTrained +
                  progress.twiceTrained + progress.perfectlyTrained;

    // Falls noch kein Fortschritt gespeichert ist, alles als "nicht gelernt" anzeigen
    if (total === 0) return level === 0 ? 100 : 0;

    let count = 0;
    switch (level) {
      case 0: count = progress.notTrained; break;
      case 1: count = progress.onceTrained; break;
      case 2: count = progress.twiceTrained; break;
      case 3: count = progress.perfectlyTrained; break;
    }

    return Math.round((count / total) * 100);
  }

  private checkEditPermissions(quizzes: QuizWithProgress[], userId: string): Observable<QuizWithProgress[]> {
    if (quizzes.length === 0) {
      return of(quizzes);
    }

    const permissionChecks = quizzes.map(quiz => {
      // Owner always has edit permission
      if (quiz.quiz.ownerId === userId) {
        return of({
          ...quiz,
          userCanEdit: true,
          isOfflineAvailable: this.offlinePreloadService.isQuizPreloaded(quiz.quiz.id)
        });
      }

      // Check via participantService with timeout
      return from(this.participantService.canEdit(quiz.quiz.id, userId)).pipe(
        timeout(5000),  // 5 seconds timeout
        catchError(() => of(false)),  // On error/timeout: no edit permission
        map(canEdit => ({
          ...quiz,
          userCanEdit: canEdit,
          isOfflineAvailable: this.offlinePreloadService.isQuizPreloaded(quiz.quiz.id)
        }))
      );
    });

    return forkJoin(permissionChecks);
  }

  canEdit(quiz: Quiz): boolean {
    const userId = this.currentUser()?.uid;
    if (!userId) return false;

    // Check if user is owner
    if (userId === quiz.ownerId) return true;

    // Check pre-computed permission from loaded data
    const qwp = this.quizzesWithProgress().find(item => item.quiz.id === quiz.id);
    return qwp?.userCanEdit ?? false;
  }

  retry(): void {
    this.loadData();
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  toggleFab(): void {
    this.fabOpen.update(open => !open);
  }
}
