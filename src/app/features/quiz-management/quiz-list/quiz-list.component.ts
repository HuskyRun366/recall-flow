import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { FirestoreService } from '../../../core/services/firestore.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { QuestionService } from '../../../core/services/question.service';
import { ProgressService } from '../../../core/services/progress.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, StatCardConfig } from '../../../shared/components';
import { Quiz, UserQuizReference } from '../../../models';
import { combineLatest, forkJoin, of, timeout, firstValueFrom } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

type TabType = 'owned' | 'co-authored' | 'public';

@Component({
  selector: 'app-quiz-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, PullToRefreshDirective, SkeletonLoaderComponent, StatCardComponent],
  templateUrl: './quiz-list.component.html',
  styleUrls: ['./quiz-list.component.scss']
})
export class QuizListComponent implements OnInit {
  private firestoreService = inject(FirestoreService);
  private participantService = inject(ParticipantService);
  private questionService = inject(QuestionService);
  private progressService = inject(ProgressService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ownedQuizzes = signal<Quiz[]>([]);
  coAuthoredQuizzes = signal<Quiz[]>([]);
  publicQuizzes = signal<Quiz[]>([]);
  userQuizRefs = signal<UserQuizReference[]>([]);
  ownedSearchTerm = signal('');
  coAuthorSearchTerm = signal('');
  publicSearchTerm = signal('');

  filteredOwnedQuizzes = computed(() => this.filterByTerm(this.ownedQuizzes(), this.ownedSearchTerm()));
  filteredCoAuthoredQuizzes = computed(() => this.filterByTerm(this.coAuthoredQuizzes(), this.coAuthorSearchTerm()));
  filteredPublicQuizzes = computed(() => this.filterByTerm(this.publicQuizzes(), this.publicSearchTerm()));

  currentSearchTerm = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return this.ownedSearchTerm();
      case 'co-authored':
        return this.coAuthorSearchTerm();
      case 'public':
        return this.publicSearchTerm();
    }
  });
  activeTab = signal<TabType>('owned');
  isLoading = signal(true);
  error = signal<string | null>(null);

  // Summary stats for the current view
  displayedQuizCount = computed(() => this.displayedQuizzes().length);
  displayedQuestionCount = computed(() =>
    this.displayedQuizzes().reduce((sum, quiz) => sum + (quiz.questionCount || 0), 0)
  );
  latestUpdatedDate = computed<Date | null>(() => {
    const quizzes = this.displayedQuizzes();
    if (!quizzes.length) return null;

    return quizzes.reduce((latest, quiz) =>
      quiz.updatedAt.getTime() > latest.getTime() ? quiz.updatedAt : latest,
      quizzes[0].updatedAt
    );
  });

  currentUser = this.authService.currentUser;
  enrollmentState = signal<Record<string, 'idle' | 'loading' | 'removing' | 'error'>>({});
  joinCode = signal('');
  joinError = signal<string | null>(null);
  joinBusy = signal(false);
  fabOpen = signal(false);

  userQuizRoleMap = computed(() => {
    const map = new Map<string, UserQuizReference['role']>();
    this.userQuizRefs().forEach(ref => map.set(ref.quizId, ref.role));
    return map;
  });

  displayedQuizzes = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return this.filteredOwnedQuizzes();
      case 'co-authored':
        return this.filteredCoAuthoredQuizzes();
      case 'public':
        return this.filteredPublicQuizzes();
    }
  });

  ngOnInit(): void {
    this.loadQuizzes();
  }

  private loadQuizzes(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    const QUERY_TIMEOUT = 8000;  // 8 seconds per query
    const TOTAL_TIMEOUT = 15000; // 15 seconds for entire operation

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

        const coAuthorRefs = userQuizRefs.filter(ref => ref.role === 'co-author');
        const participantRefs = userQuizRefs.filter(ref => ref.role === 'participant');

        // Fetch Quiz objects for co-authored and participant quizzes using batch query
        // This reduces N individual reads to 1 query (or ceil(N/30) for larger lists)
        const coAuthorIds = coAuthorRefs.map(ref => ref.quizId);
        const participantIds = participantRefs.map(ref => ref.quizId);

        const coAuthor$ = coAuthorIds.length > 0
          ? this.firestoreService.getQuizzesByIds(coAuthorIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading co-author quizzes:', error);
                return of([] as Quiz[]);
              })
            )
          : of([] as Quiz[]);

        const participant$ = participantIds.length > 0
          ? this.firestoreService.getQuizzesByIds(participantIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading participant quizzes:', error);
                return of([] as Quiz[]);
              })
            )
          : of([] as Quiz[]);

        return forkJoin([coAuthor$, participant$]).pipe(
          timeout(QUERY_TIMEOUT),
          map(([coAuthorQuizzes, participantQuizzes]) => ({
            coAuthorQuizzes,
            participantQuizzes
          })),
          catchError(error => {
            console.error('Error loading co-author/participant quizzes:', error);
            return of({ coAuthorQuizzes: [] as Quiz[], participantQuizzes: [] as Quiz[] });
          })
        );
      }),
      catchError(error => {
        console.error('Critical error in quiz loading:', error);
        this.error.set('Failed to load quizzes. Please refresh the page.');
        this.isLoading.set(false);
        return of({ coAuthorQuizzes: [] as Quiz[], participantQuizzes: [] as Quiz[] });
      })
    ).subscribe({
      next: ({ coAuthorQuizzes, participantQuizzes }) => {
        this.coAuthoredQuizzes.set(coAuthorQuizzes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        // Only show quizzes where user is enrolled as participant (not all public quizzes)
        this.publicQuizzes.set(participantQuizzes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Unexpected error:', err);
        this.error.set('An unexpected error occurred.');
        this.isLoading.set(false);
      }
    });
  }

  setActiveTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  onRefresh(): void {
    console.log('🔄 Pull-to-refresh triggered');
    this.loadQuizzes();
  }

  onSearch(term: string): void {
    switch (this.activeTab()) {
      case 'owned':
        this.ownedSearchTerm.set(term);
        break;
      case 'co-authored':
        this.coAuthorSearchTerm.set(term);
        break;
      case 'public':
        this.publicSearchTerm.set(term);
        break;
    }
  }

  clearSearch(): void {
    switch (this.activeTab()) {
      case 'owned':
        this.ownedSearchTerm.set('');
        break;
      case 'co-authored':
        this.coAuthorSearchTerm.set('');
        break;
      case 'public':
        this.publicSearchTerm.set('');
        break;
    }
  }

  toggleFab(): void {
    this.fabOpen.update(open => !open);
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

  createNewQuiz(): void {
    this.router.navigate(['/quiz', 'editor', 'new']);
  }

  editQuiz(quizId: string): void {
    this.router.navigate(['/quiz', 'editor', quizId]);
  }

  viewDetails(quizId: string): void {
    this.router.navigate(['/quiz', quizId]);
  }

  startQuiz(quiz: Quiz): void {
    if (this.requiresEnrollment(quiz) && !this.isEnrolled(quiz.id)) {
      this.toastService.warning('Bitte füge dich zuerst zu diesem Quiz hinzu');
      return;
    }
    this.router.navigate(['/quiz', quiz.id, 'take']);
  }

  requiresEnrollment(quiz: Quiz): boolean {
    return quiz.visibility === 'public' && !this.isOwner(quiz) && !this.isCoAuthor(quiz);
  }

  isEnrolled(quizId: string): boolean {
    return this.userQuizRoleMap().get(quizId) === 'participant';
  }

  isCoAuthor(quiz: Quiz): boolean {
    return this.userQuizRoleMap().get(quiz.id) === 'co-author';
  }

  isEnrolling(quizId: string): boolean {
    return this.enrollmentState()[quizId] === 'loading';
  }

  isUnenrolling(quizId: string): boolean {
    return this.enrollmentState()[quizId] === 'removing';
  }

  isEnrollmentBusy(quizId: string): boolean {
    const state = this.enrollmentState()[quizId];
    return state === 'loading' || state === 'removing';
  }

  private updateEnrollmentState(quizId: string, state: 'idle' | 'loading' | 'removing' | 'error'): void {
    this.enrollmentState.update(current => ({ ...current, [quizId]: state }));
  }

  async enrollInQuiz(quiz: Quiz): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.requiresEnrollment(quiz) || this.isEnrolled(quiz.id) || this.isEnrolling(quiz.id)) {
      return;
    }

    // 1. OPTIMISTIC UPDATE - Immediately update UI
    const previousPublicQuizzes = this.publicQuizzes();
    const optimisticRef: UserQuizReference = {
      quizId: quiz.id,
      role: 'participant',
      addedAt: new Date(),
      lastAccessedAt: new Date()
    };

    this.userQuizRefs.update(refs => [...refs, optimisticRef]);
    this.publicQuizzes.update(quizzes => {
      if (quizzes.some(q => q.id === quiz.id)) return quizzes;
      return [...quizzes, quiz].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });
    this.updateEnrollmentState(quiz.id, 'loading');

    // 2. Firestore write in background
    try {
      await this.participantService.addParticipant(
        quiz.id,
        user.uid,
        user.email || '',
        'participant',
        user.uid,
        'accepted'
      );

      // Success - keep optimistic state
      this.updateEnrollmentState(quiz.id, 'idle');
      this.toastService.success(`"${quiz.title}" hinzugefügt`);
    } catch (err) {
      // 3. ROLLBACK on error
      console.error('Error enrolling in quiz:', err);
      this.userQuizRefs.update(refs => refs.filter(ref => ref.quizId !== quiz.id));
      this.publicQuizzes.set(previousPublicQuizzes);
      this.updateEnrollmentState(quiz.id, 'error');
      this.toastService.error('Quiz konnte nicht hinzugefügt werden');
    }
  }

  async unenrollFromQuiz(quiz: Quiz): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.isEnrolled(quiz.id) || this.isUnenrolling(quiz.id)) {
      return;
    }

    // 1. Store for rollback
    const previousRefs = this.userQuizRefs();
    const previousPublicQuizzes = this.publicQuizzes();

    // 2. OPTIMISTIC UPDATE - Immediately update UI
    this.userQuizRefs.update(refs => refs.filter(ref => ref.quizId !== quiz.id));
    this.publicQuizzes.update(quizzes => quizzes.filter(q => q.id !== quiz.id));
    this.updateEnrollmentState(quiz.id, 'removing');

    // 3. Firestore write in background
    try {
      await this.participantService.removeParticipant(quiz.id, user.uid);

      // Success - keep optimistic state
      this.updateEnrollmentState(quiz.id, 'idle');
      this.toastService.success(`"${quiz.title}" entfernt`);
    } catch (err) {
      // 4. ROLLBACK on error
      console.error('Error removing quiz enrollment:', err);
      this.userQuizRefs.set(previousRefs);
      this.publicQuizzes.set(previousPublicQuizzes);
      this.updateEnrollmentState(quiz.id, 'error');
      this.toastService.error('Quiz konnte nicht entfernt werden');
    }
  }

  async deleteQuiz(quiz: Quiz): Promise<void> {
    if (!confirm(`Are you sure you want to delete "${quiz.title}"? This will also delete all questions, progress data, and participant records. This action cannot be undone.`)) {
      return;
    }

    try {
      await this.firestoreService.deleteQuizWithCleanup(
        quiz.id,
        this.questionService,
        this.progressService,
        this.participantService
      );
      // Remove from local state
      this.ownedQuizzes.update(quizzes => quizzes.filter(q => q.id !== quiz.id));
      this.toastService.success(`"${quiz.title}" wurde gelöscht`);
    } catch (err: any) {
      console.error('Error deleting quiz:', err);
      this.toastService.error(`Löschen fehlgeschlagen: ${err.message}`, 5000);
    }
  }

  canEdit(quiz: Quiz): boolean {
    const userId = this.currentUser()?.uid;
    if (!userId) return false;

    // Check if user is owner or listed as co-author for the quiz
    return userId === quiz.ownerId || this.isCoAuthor(quiz);
  }

  isOwner(quiz: Quiz): boolean {
    return this.currentUser()?.uid === quiz.ownerId;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  async joinByCode(): Promise<void> {
    const code = this.joinCode().trim();
    const user = this.currentUser();

    if (!code) {
      this.joinError.set('Bitte gib einen Code ein.');
      return;
    }

    if (!user) {
      this.joinError.set('Du musst angemeldet sein.');
      return;
    }

    this.joinBusy.set(true);
    this.joinError.set(null);

    try {
      // Look up quiz by join code
      const quiz = await firstValueFrom(
        this.firestoreService.getQuizByJoinCode(code)
      );

      if (!quiz) {
        this.joinError.set('Kein Quiz mit diesem Code gefunden.');
        this.joinBusy.set(false);
        return;
      }

      // Check if user is already enrolled
      const existingRef = this.userQuizRefs().find(ref => ref.quizId === quiz.id);
      if (existingRef) {
        this.joinError.set('Du bist diesem Quiz bereits beigetreten.');
        this.joinBusy.set(false);
        return;
      }

      // Add user as participant
      await this.participantService.addParticipant(
        quiz.id,
        user.uid,
        user.email || '',
        'participant',
        user.uid,
        'accepted'
      );

      // Update local state
      const newRef: UserQuizReference = {
        quizId: quiz.id,
        role: 'participant',
        addedAt: new Date(),
        lastAccessedAt: new Date()
      };

      this.userQuizRefs.update(refs => [...refs, newRef]);

      // Clear form and close modal (by unchecking the checkbox)
      this.joinCode.set('');
      this.joinError.set(null);
      this.joinBusy.set(false);

      // Close the modal by unchecking the toggle
      const toggleCheckbox = document.getElementById('join-toggle') as HTMLInputElement;
      if (toggleCheckbox) {
        toggleCheckbox.checked = false;
      }

      // Navigate to quiz detail
      this.router.navigate(['/quiz', quiz.id]);
    } catch (err: any) {
      console.error('Error joining quiz by code:', err);
      this.joinError.set('Fehler beim Beitreten: ' + (err.message || 'Unbekannter Fehler'));
      this.joinBusy.set(false);
    }
  }
}
