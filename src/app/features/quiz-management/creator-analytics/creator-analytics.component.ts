import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, of, timeout } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { FirestoreService } from '../../../core/services/firestore.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { Quiz, UserQuizReference } from '../../../models';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

@Component({
  selector: 'app-creator-analytics',
  standalone: true,
  imports: [CommonModule, TranslateModule, PullToRefreshDirective, SkeletonLoaderComponent],
  templateUrl: './creator-analytics.component.html',
  styleUrls: ['./creator-analytics.component.scss']
})
export class CreatorAnalyticsComponent implements OnInit {
  private firestoreService = inject(FirestoreService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ownedQuizzes = signal<Quiz[]>([]);
  coAuthoredQuizzes = signal<Quiz[]>([]);
  userQuizRefs = signal<UserQuizReference[]>([]);
  searchTerm = signal('');

  analyticsQuizzes = computed(() =>
    this.deduplicate([...this.ownedQuizzes(), ...this.coAuthoredQuizzes()])
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  );
  filteredQuizzes = computed(() => this.filterByTerm(this.analyticsQuizzes(), this.searchTerm()));

  isLoading = signal(true);
  error = signal<string | null>(null);

  // Summary stats
  displayedQuizCount = computed(() => this.filteredQuizzes().length);
  displayedQuestionCount = computed(() =>
    this.filteredQuizzes().reduce((sum, quiz) => sum + (quiz.questionCount || 0), 0)
  );
  latestUpdatedDate = computed<Date | null>(() => {
    const quizzes = this.filteredQuizzes();
    if (!quizzes.length) return null;

    return quizzes.reduce((latest, quiz) =>
      quiz.updatedAt.getTime() > latest.getTime() ? quiz.updatedAt : latest,
      quizzes[0].updatedAt
    );
  });
  maxQuestionCount = computed(() => {
    const quizzes = this.filteredQuizzes();
    if (!quizzes.length) return 1;
    const max = Math.max(...quizzes.map(quiz => quiz.questionCount || 0));
    return Math.max(1, max);
  });

  currentUser = this.authService.currentUser;

  userQuizRoleMap = computed(() => {
    const map = new Map<string, UserQuizReference['role']>();
    this.userQuizRefs().forEach(ref => map.set(ref.quizId, ref.role));
    return map;
  });

  ngOnInit(): void {
    this.loadQuizzes();
  }

  onRefresh(): void {
    this.loadQuizzes();
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  viewAnalytics(quizId: string): void {
    this.router.navigate(['/quiz', quizId, 'analytics']);
  }

  viewDetails(quizId: string): void {
    this.router.navigate(['/quiz', quizId]);
  }

  editQuiz(quizId: string): void {
    this.router.navigate(['/quiz', 'editor', quizId]);
  }

  isOwner(quiz: Quiz): boolean {
    return this.currentUser()?.uid === quiz.ownerId;
  }

  isCoAuthor(quiz: Quiz): boolean {
    return this.userQuizRoleMap().get(quiz.id) === 'co-author';
  }

  canEdit(quiz: Quiz): boolean {
    return this.isOwner(quiz) || this.isCoAuthor(quiz);
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  private loadQuizzes(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    const QUERY_TIMEOUT = 8000;
    const TOTAL_TIMEOUT = 15000;

    combineLatest([
      this.firestoreService.getQuizzesForUser(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading owned quizzes:', error);
          return of([] as Quiz[]);
        })
      ),
      this.participantService.getUserQuizzes(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading user quiz refs:', error);
          return of([] as UserQuizReference[]);
        })
      )
    ]).pipe(
      timeout(TOTAL_TIMEOUT),
      takeUntilDestroyed(this.destroyRef),
      switchMap(([owned, userQuizRefs]) => {
        this.ownedQuizzes.set(owned.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
        this.userQuizRefs.set(userQuizRefs);

        const coAuthorIds = userQuizRefs
          .filter(ref => ref.role === 'co-author')
          .map(ref => ref.quizId);

        const coAuthor$ = coAuthorIds.length > 0
          ? this.firestoreService.getQuizzesByIds(coAuthorIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading co-author quizzes:', error);
                return of([] as Quiz[]);
              })
            )
          : of([] as Quiz[]);

        return coAuthor$;
      }),
      catchError(error => {
        console.error('Critical error in analytics loading:', error);
        this.error.set('Failed to load analytics. Please refresh the page.');
        this.isLoading.set(false);
        return of([] as Quiz[]);
      })
    ).subscribe({
      next: (coAuthorQuizzes) => {
        this.coAuthoredQuizzes.set(coAuthorQuizzes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Unexpected error:', err);
        this.error.set('An unexpected error occurred.');
        this.isLoading.set(false);
      }
    });
  }

  private filterByTerm(quizzes: Quiz[], term: string): Quiz[] {
    const needle = term.trim().toLowerCase();
    if (!needle) return quizzes;

    return quizzes.filter(quiz => {
      const titleMatch = quiz.title.toLowerCase().includes(needle);
      const descriptionMatch = (quiz.description || '').toLowerCase().includes(needle);
      return titleMatch || descriptionMatch;
    });
  }

  private deduplicate(quizzes: Quiz[]): Quiz[] {
    const map = new Map<string, Quiz>();
    quizzes.forEach(q => {
      if (!map.has(q.id)) {
        map.set(q.id, q);
      }
    });
    return Array.from(map.values());
  }
}
