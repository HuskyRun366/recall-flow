import { Component, OnInit, OnDestroy, signal, computed, inject, DestroyRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { FirestoreService } from '../../../core/services/firestore.service';
import { QuestionService } from '../../../core/services/question.service';
import { ProgressService } from '../../../core/services/progress.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdaptiveLearningService } from '../../../core/services/adaptive-learning.service';
import { KeyboardShortcutsService } from '../../../core/services/keyboard-shortcuts.service';
import { Quiz, Question, QuestionProgress } from '../../../models';
import { MultipleChoiceComponent } from '../components/multiple-choice/multiple-choice.component';
import { OrderingQuestionComponent } from '../components/ordering-question/ordering-question.component';
import { MatchingQuestionComponent } from '../components/matching-question/matching-question.component';
import { FlashcardComponent } from '../components/flashcard/flashcard.component';
import { SwipeGestureDirective } from '../../../shared/directives/swipe-gesture.directive';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';
import { StatCardComponent } from '../../../shared/components';
import { switchMap, map, catchError } from 'rxjs/operators';

interface QuestionWithProgress {
  question: Question;
  progress: QuestionProgress;
}

@Component({
  selector: 'app-quiz-session',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    StatCardComponent,
    MultipleChoiceComponent,
    OrderingQuestionComponent,
    MatchingQuestionComponent,
    FlashcardComponent,
    SwipeGestureDirective,
    PullToRefreshDirective
  ],
  templateUrl: './quiz-session.component.html',
  styleUrls: ['./quiz-session.component.scss']
})
export class QuizSessionComponent implements OnInit, OnDestroy {
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private progressService = inject(ProgressService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private adaptiveLearning = inject(AdaptiveLearningService);
  private titleService = inject(Title);
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private originalTitle = 'RecallFlow';
  private questionStartAt = Date.now();
  private lastQuestionId: string | null = null;
  private repeatCounts = new Map<string, number>();
  private readonly repeatLimit = 2;
  private readonly repeatSpacing = 3;

  quiz = signal<Quiz | null>(null);
  questions = signal<Question[]>([]);
  questionsWithProgress = signal<QuestionWithProgress[]>([]);
  allQuestionsWithProgress = signal<QuestionWithProgress[]>([]); // Store all questions for review mode
  currentIndex = signal(0);
  isLoading = signal(true);
  error = signal<string | null>(null);
  showResult = signal(false);
  lastAnswerCorrect = signal(false);
  showSwipeHint = signal(true);
  isReviewMode = signal(false); // Track if in review mode
  showCompletion = signal(false); // Show completion screen
  isFlashcardMode = signal(false); // Track if in flashcard mode

  currentUser = this.authService.currentUser;

  constructor() {
    // Check if swipe hint was dismissed
    const dismissed = localStorage.getItem('swipe-hint-dismissed');
    if (dismissed === 'true') {
      this.showSwipeHint.set(false);
    }

    // Update browser title with quiz progress
    effect(() => {
      const quiz = this.quiz();
      const current = this.currentIndex() + 1;
      const total = this.questionsWithProgress().length;
      const progressPercent = this.progress();

      if (quiz && total > 0) {
        this.titleService.setTitle(`${progressPercent}% (${current}/${total}) - ${quiz.title} | RecallFlow`);
      }
    });

    // Track response time per question
    effect(() => {
      const current = this.currentQuestion();
      const id = current?.question.id ?? null;
      if (id && id !== this.lastQuestionId) {
        this.lastQuestionId = id;
        this.questionStartAt = Date.now();
      }
    });
  }

  currentQuestion = computed(() => {
    const questions = this.questionsWithProgress();
    const index = this.currentIndex();
    return index < questions.length ? questions[index] : null;
  });

  adaptiveInfo = computed(() => {
    const current = this.currentQuestion();
    if (!current) {
      return null;
    }

    const userId = this.currentUser()?.uid;
    const rawDueInDays = this.adaptiveLearning.getDaysUntilDue(current.progress);
    const difficulty = current.progress.difficulty ?? 0.5;
    const difficultyLabel = this.adaptiveLearning.getDifficultyLabel(difficulty);
    const forgetInDays = this.adaptiveLearning.predictForgetInDays(current.progress, userId);

    return {
      dueInDays: Math.max(0, rawDueInDays),
      isDue: rawDueInDays <= 0,
      difficultyLabelKey: `quizSession.adaptive.difficultyLabels.${difficultyLabel}`,
      forgetInDays
    };
  });

  progress = computed(() => {
    const total = this.questionsWithProgress().length;
    const current = this.currentIndex() + 1; // inclusive of current question
    return total > 0 ? Math.round((current / total) * 100) : 0;
  });

  ngOnInit(): void {
    const quizId = this.route.snapshot.paramMap.get('id');
    if (quizId) {
      this.loadQuiz(quizId);
    } else {
      this.error.set('Invalid quiz ID');
      this.isLoading.set(false);
    }

    // Register quiz-specific keyboard shortcuts
    this.keyboardShortcuts.register({
      key: 'ArrowLeft',
      description: 'Vorherige Frage',
      action: () => this.previousQuestion()
    });

    this.keyboardShortcuts.register({
      key: 'ArrowRight',
      description: 'Nächste Frage',
      action: () => this.nextQuestion()
    });

    this.keyboardShortcuts.register({
      key: ' ',
      description: 'Ergebnis anzeigen / Weiter',
      action: () => {
        if (!this.showResult()) {
          // If result not shown yet, show it
          this.showResult.set(true);
        } else {
          // If result is shown, go to next question
          this.nextQuestion();
        }
      }
    });

    this.keyboardShortcuts.register({
      key: 'Escape',
      description: 'Quiz beenden',
      action: () => this.exitQuiz()
    });
  }

  private loadQuiz(quizId: string): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    // First check if user has access to this quiz
    this.firestoreService.getQuizById(quizId).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(async (quiz) => {
        if (!quiz) {
          throw new Error('Quiz not found');
        }

        // Check access: public/unlisted quizzes are open, otherwise check participation
        const hasAccess = await this.checkQuizAccess(quiz, userId);
        if (!hasAccess) {
          throw new Error('You do not have permission to access this quiz');
        }

        return quiz;
      }),
      switchMap((quiz) => {
        return this.questionService.getQuestionsByQuizId(quizId).pipe(
          map(questions => ({ quiz, questions }))
        );
      }),
      switchMap(({ quiz, questions }) => {
        this.quiz.set(quiz);
        const randomizedQuestions = questions.map(q => this.randomizeQuestion(q));
        this.questions.set(randomizedQuestions);

        return this.progressService.getQuestionProgress(quizId, userId).pipe(
          map(progressList => ({ questions: randomizedQuestions, progressList })),
          catchError(() => {
            // Continue without progress data
            return [{
              questions: randomizedQuestions,
              progressList: [] as QuestionProgress[]
            }];
          })
        );
      })
    ).subscribe({
      next: ({ questions, progressList }) => {
        const progressMap = new Map(progressList.map(p => [p.questionId, p]));

        const questionsWithProgress = questions.map(question => ({
          question,
          progress: progressMap.get(question.id) || {
            questionId: question.id,
            level: 0 as const,
            lastAttemptAt: new Date(),
            correctCount: 0,
            incorrectCount: 0,
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0,
            nextReviewAt: new Date(),
            lastQuality: 0,
            lastResponseMs: undefined,
            difficulty: 0.5
          }
        }));

        // Store all questions for potential review mode
        const prioritized = this.adaptiveLearning.sortByPriority(questionsWithProgress);
        this.allQuestionsWithProgress.set(prioritized);
        this.questionsWithProgress.set(prioritized);
        this.repeatCounts.clear();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading quiz:', err);
        this.error.set(err.message || 'Failed to load quiz');
        this.isLoading.set(false);
      }
    });
  }

  private async checkQuizAccess(quiz: Quiz, userId: string): Promise<boolean> {
    // Public and unlisted quizzes are accessible to everyone
    if (quiz.visibility === 'public' || quiz.visibility === 'unlisted') {
      return true;
    }

    // Owner always has access
    if (quiz.ownerId === userId) {
      return true;
    }

    // Check if user is a participant or co-author
    const participant = await this.participantService.getParticipantAsync(quiz.id, userId);
    return participant !== null;
  }

  private randomizeQuestion(question: Question): Question {
    if (question.type === 'multiple-choice' && question.options) {
      return {
        ...question,
        options: this.shuffleArray(question.options)
      };
    }

    if (question.type === 'ordering' && question.orderItems) {
      return {
        ...question,
        orderItems: [...question.orderItems]
      };
    }

    if (question.type === 'matching' && question.matchingPairs) {
      return {
        ...question,
        matchingPairs: this.shuffleArray(question.matchingPairs),
        matchingChoices: question.matchingChoices ? [...question.matchingChoices] : []
      };
    }

    return question;
  }

  private shuffleArray<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async onAnswer(isCorrect: boolean): Promise<void> {
    const currentQ = this.currentQuestion();
    const userId = this.currentUser()?.uid;
    const quiz = this.quiz();

    if (!currentQ || !userId || !quiz) return;

    this.lastAnswerCorrect.set(isCorrect);
    this.showResult.set(true);
    const responseTimeMs = Math.max(0, Date.now() - this.questionStartAt);

    try {
      // Update progress using the new service method
      const updatedProgress = await this.progressService.updateQuestionProgress(
        quiz.id,
        userId,
        currentQ.question.id,
        isCorrect,
        responseTimeMs
      );

      this.updateLocalProgress(currentQ.question.id, updatedProgress);

      if (!isCorrect && !this.isReviewMode()) {
        this.scheduleRepeat(currentQ);
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }

  nextQuestion(): void {
    this.showResult.set(false);
    const nextIndex = this.currentIndex() + 1;

    if (nextIndex >= this.questionsWithProgress().length) {
      this.finishQuiz();
    } else {
      this.currentIndex.set(nextIndex);
    }
  }

  previousQuestion(): void {
    if (this.currentIndex() > 0) {
      this.showResult.set(false);
      this.currentIndex.update(i => i - 1);
    }
  }

  finishQuiz(): void {
    // Show completion screen instead of navigating away
    this.showCompletion.set(true);
  }

  // Get questions that were answered incorrectly (level 0 or incorrectCount > 0)
  getWrongQuestions(): QuestionWithProgress[] {
    return this.allQuestionsWithProgress().filter(
      q => q.progress.level === 0 || q.progress.incorrectCount > 0
    );
  }

  // Computed signal for wrong question count
  wrongQuestionCount = computed(() => this.getWrongQuestions().length);

  // Start review mode with only wrong answers
  startReviewMode(): void {
    const wrongQuestions = this.getWrongQuestions();

    if (wrongQuestions.length === 0) {
      // No wrong answers, return to home
      this.router.navigate(['/quiz', 'home']);
      return;
    }

    // Set up review mode
    this.isReviewMode.set(true);
    this.showCompletion.set(false);
    this.currentIndex.set(0);
    this.showResult.set(false);
    this.repeatCounts.clear();
    this.questionsWithProgress.set(this.adaptiveLearning.sortByPriority(wrongQuestions));

    // Update title for review mode
    const quiz = this.quiz();
    if (quiz) {
      this.titleService.setTitle(`Wiederholung - ${quiz.title} | RecallFlow`);
    }
  }

  // Exit to home
  exitToHome(): void {
    this.router.navigate(['/quiz', 'home']);
  }

  // Toggle flashcard mode
  toggleFlashcardMode(): void {
    this.isFlashcardMode.update(mode => !mode);
    // Reset result when switching modes
    this.showResult.set(false);
  }

  exitQuiz(): void {
    if (confirm('Are you sure you want to exit? Your progress has been saved.')) {
      this.router.navigate(['/quiz', 'home']);
    }
  }

  dismissSwipeHint(): void {
    this.showSwipeHint.set(false);
    localStorage.setItem('swipe-hint-dismissed', 'true');
  }

  onRefresh(): void {
    // Reload current question's progress from server
    const currentQ = this.currentQuestion();
    const userId = this.currentUser()?.uid;
    const quiz = this.quiz();

    if (!currentQ || !userId || !quiz) return;

    this.progressService.getSingleQuestionProgress(
      quiz.id,
      userId,
      currentQ.question.id
    ).subscribe({
      next: (updatedProgress) => {
        if (updatedProgress) {
          this.updateLocalProgress(currentQ.question.id, updatedProgress);
          console.log('🔄 Fortschritt aktualisiert');
        }
      },
      error: (err) => {
        console.error('Error refreshing progress:', err);
      }
    });
  }

  private updateLocalProgress(questionId: string, progress: QuestionProgress): void {
    const updateList = (items: QuestionWithProgress[]) =>
      items.map(item => item.question.id === questionId ? { ...item, progress } : item);

    this.questionsWithProgress.set(updateList(this.questionsWithProgress()));
    this.allQuestionsWithProgress.set(updateList(this.allQuestionsWithProgress()));
  }

  private scheduleRepeat(question: QuestionWithProgress): void {
    const questionId = question.question.id;
    const repeats = this.repeatCounts.get(questionId) ?? 0;
    if (repeats >= this.repeatLimit) {
      return;
    }

    this.repeatCounts.set(questionId, repeats + 1);

    const questions = [...this.questionsWithProgress()];
    const insertIndex = Math.min(this.currentIndex() + this.repeatSpacing, questions.length);
    questions.splice(insertIndex, 0, {
      ...question,
      progress: { ...question.progress }
    });
    this.questionsWithProgress.set(questions);
  }

  ngOnDestroy(): void {
    // Restore original title when leaving quiz
    this.titleService.setTitle(this.originalTitle);

    // Cleanup keyboard shortcuts
    this.keyboardShortcuts.unregister('ArrowLeft');
    this.keyboardShortcuts.unregister('ArrowRight');
    this.keyboardShortcuts.unregister(' ');
    this.keyboardShortcuts.unregister('Escape');
  }
}
