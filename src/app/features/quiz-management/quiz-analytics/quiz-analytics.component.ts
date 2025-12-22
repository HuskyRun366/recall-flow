import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  effect,
  DestroyRef,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, from } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import Chart from 'chart.js/auto';
import { FirestoreService } from '../../../core/services/firestore.service';
import { QuestionService } from '../../../core/services/question.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { QuizAnalyticsService } from '../../../core/services/quiz-analytics.service';
import { Quiz, Question, QuestionAnalyticsStat, QuizAnalyticsSummary } from '../../../models';
import { StatCardComponent } from '../../../shared/components';

type DifficultyLabel = 'easy' | 'medium' | 'hard';

interface QuestionRow {
  question: Question;
  attempts: number;
  correct: number;
  incorrect: number;
  correctRate: number;
  avgResponseMs: number;
  difficulty: DifficultyLabel;
  dropOffRate: number;
}

@Component({
  selector: 'app-quiz-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StatCardComponent],
  templateUrl: './quiz-analytics.component.html',
  styleUrls: ['./quiz-analytics.component.scss']
})
export class QuizAnalyticsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private analyticsService = inject(QuizAnalyticsService);
  private destroyRef = inject(DestroyRef);

  private difficultyCanvas?: ElementRef<HTMLCanvasElement>;
  private dropoffCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('difficultyChart')
  set difficultyChartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.difficultyCanvas = ref;
    this.tryInitCharts();
  }

  @ViewChild('dropoffChart')
  set dropoffChartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.dropoffCanvas = ref;
    this.tryInitCharts();
  }

  quiz = signal<Quiz | null>(null);
  questions = signal<Question[]>([]);
  questionStats = signal<QuestionAnalyticsStat[]>([]);
  summary = signal<QuizAnalyticsSummary | null>(null);

  isLoading = signal(true);
  summaryLoading = signal(true);
  error = signal<string | null>(null);
  lastUpdated = signal<Date | null>(null);

  abQuestionAId = signal<string | null>(null);
  abQuestionBId = signal<string | null>(null);

  private chartsReady = signal(false);
  private difficultyChart?: Chart;
  private dropoffChart?: Chart;

  questionRows = computed<QuestionRow[]>(() => {
    const questions = [...this.questions()].sort((a, b) => a.orderIndex - b.orderIndex);
    const statsMap = new Map(this.questionStats().map(stat => [stat.questionId, stat]));

    const baseRows = questions.map(question => {
      const stat = statsMap.get(question.id);
      const attempts = stat?.attempts ?? 0;
      const correct = stat?.correct ?? 0;
      const incorrect = stat?.incorrect ?? 0;
      const correctRate = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
      const avgResponseMs = attempts > 0 ? Math.round((stat?.totalResponseMs ?? 0) / attempts) : 0;
      const difficulty: DifficultyLabel =
        correctRate >= 70 ? 'easy' : correctRate >= 40 ? 'medium' : 'hard';

      return {
        question,
        attempts,
        correct,
        incorrect,
        correctRate,
        avgResponseMs,
        difficulty,
        dropOffRate: 0
      };
    });

    const attemptsList = baseRows.map(row => row.attempts);

    return baseRows.map((row, index) => ({
      ...row,
      dropOffRate: this.calculateDropOff(attemptsList, index)
    }));
  });

  hasStats = computed(() => this.questionRows().some(row => row.attempts > 0));

  selectedA = computed(() =>
    this.questionRows().find(row => row.question.id === this.abQuestionAId()) ?? null
  );
  selectedB = computed(() =>
    this.questionRows().find(row => row.question.id === this.abQuestionBId()) ?? null
  );

  totalUsersLabel = computed(() =>
    this.summaryLoading() ? '—' : (this.summary()?.totalUsers ?? 0)
  );
  completionsLabel = computed(() =>
    this.summaryLoading() ? '—' : (this.summary()?.completions ?? 0)
  );
  avgCompletionLabel = computed(() => {
    if (this.summaryLoading()) return '—';
    const avg = this.summary()?.averageCompletionRate ?? 0;
    return `${avg.toFixed(1)}%`;
  });

  constructor() {
    effect(() => {
      if (!this.chartsReady()) return;
      const rows = this.questionRows();
      this.updateDifficultyChart(rows);
      this.updateDropoffChart(rows);
    });
  }

  ngOnInit(): void {
    const quizId = this.route.snapshot.paramMap.get('id');
    if (!quizId) {
      this.error.set('Ungültige Quiz-ID');
      this.isLoading.set(false);
      return;
    }

    this.firestoreService.getQuizById(quizId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: async (quiz) => {
        if (!quiz) {
          this.error.set('Quiz nicht gefunden');
          this.isLoading.set(false);
          return;
        }

        const userId = this.authService.currentUser()?.uid;
        if (!userId) {
          this.error.set('User nicht angemeldet');
          this.isLoading.set(false);
          return;
        }

        const canView = await this.canEditQuiz(quiz, userId);
        if (!canView) {
          this.error.set('Kein Zugriff auf Analytics');
          this.isLoading.set(false);
          return;
        }

        this.quiz.set(quiz);
        this.loadQuestions(quizId);
        this.loadQuestionStats(quizId);
        this.startSummaryRefresh(quizId);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error(err);
        this.error.set('Fehler beim Laden');
        this.isLoading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.difficultyChart?.destroy();
    this.dropoffChart?.destroy();
  }

  backToDetail(): void {
    const quiz = this.quiz();
    if (quiz) {
      this.router.navigate(['/quiz', quiz.id]);
    }
  }

  refreshSummary(): void {
    const quizId = this.quiz()?.id;
    if (!quizId) return;
    this.fetchSummary(quizId);
  }

  setAbQuestionA(questionId: string): void {
    this.abQuestionAId.set(questionId);
  }

  setAbQuestionB(questionId: string): void {
    this.abQuestionBId.set(questionId);
  }

  private async canEditQuiz(quiz: Quiz, userId: string): Promise<boolean> {
    if (quiz.ownerId === userId) {
      return true;
    }
    return this.participantService.canEdit(quiz.id, userId);
  }

  private loadQuestions(quizId: string): void {
    this.questionService.getQuestionsByQuizId(quizId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (questions) => {
        this.questions.set(questions);
        this.ensureAbSelection(questions);
      },
      error: (err: unknown) => console.error('Fragen laden fehlgeschlagen', err)
    });
  }

  private loadQuestionStats(quizId: string): void {
    this.analyticsService.getQuestionStats(quizId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: stats => this.questionStats.set(stats),
      error: (err: unknown) => console.error('Analytics laden fehlgeschlagen', err)
    });
  }

  private startSummaryRefresh(quizId: string): void {
    interval(30000).pipe(
      startWith(0),
      switchMap(() => from(this.fetchSummary(quizId))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  private async fetchSummary(quizId: string): Promise<void> {
    this.summaryLoading.set(true);
    try {
      const summary = await this.analyticsService.getQuizSummary(quizId);
      this.summary.set(summary);
      this.lastUpdated.set(new Date());
    } catch (err) {
      console.error('Summary load failed', err);
    } finally {
      this.summaryLoading.set(false);
    }
  }

  private ensureAbSelection(questions: Question[]): void {
    if (questions.length === 0) {
      this.abQuestionAId.set(null);
      this.abQuestionBId.set(null);
      return;
    }

    const ids = questions.map(q => q.id);
    const currentA = this.abQuestionAId();
    const currentB = this.abQuestionBId();

    if (!currentA || !ids.includes(currentA)) {
      this.abQuestionAId.set(ids[0]);
    }

    if (!currentB || !ids.includes(currentB)) {
      this.abQuestionBId.set(ids[1] ?? ids[0]);
    }
  }

  private calculateDropOff(attempts: number[], index: number): number {
    const current = attempts[index] ?? 0;
    const next = attempts[index + 1] ?? 0;
    if (current === 0 || index >= attempts.length - 1) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - next / current) * 100)));
  }

  private tryInitCharts(): void {
    if (this.chartsReady() || !this.difficultyCanvas || !this.dropoffCanvas) {
      return;
    }

    const difficultyCtx = this.difficultyCanvas.nativeElement.getContext('2d');
    const dropoffCtx = this.dropoffCanvas.nativeElement.getContext('2d');

    if (!difficultyCtx || !dropoffCtx) return;

    this.difficultyChart = new Chart(difficultyCtx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Correct %',
            data: [],
            backgroundColor: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (value) => `${value}%` }
          }
        }
      }
    });

    this.dropoffChart = new Chart(dropoffCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Drop-off %',
            data: [],
            borderColor: this.getThemeColor('--color-warning', '#ff9800'),
            backgroundColor: this.withAlpha(this.getThemeColor('--color-warning', '#ff9800'), 0.2),
            tension: 0.35,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (value) => `${value}%` }
          }
        }
      }
    });

    this.chartsReady.set(true);
  }

  private updateDifficultyChart(rows: QuestionRow[]): void {
    if (!this.difficultyChart) return;
    const labels = rows.map(row => `Q${row.question.orderIndex + 1}`);
    const data = rows.map(row => row.correctRate);
    const colors = rows.map(row => this.getDifficultyColor(row.difficulty));

    this.difficultyChart.data.labels = labels;
    this.difficultyChart.data.datasets[0].data = data;
    (this.difficultyChart.data.datasets[0] as any).backgroundColor = colors;
    this.difficultyChart.update();
  }

  private updateDropoffChart(rows: QuestionRow[]): void {
    if (!this.dropoffChart) return;
    const labels = rows.map(row => `Q${row.question.orderIndex + 1}`);
    const data = rows.map(row => row.dropOffRate);

    this.dropoffChart.data.labels = labels;
    this.dropoffChart.data.datasets[0].data = data;
    this.dropoffChart.update();
  }

  private getDifficultyColor(level: DifficultyLabel): string {
    switch (level) {
      case 'easy':
        return this.getThemeColor('--color-success', '#4caf50');
      case 'medium':
        return this.getThemeColor('--color-warning', '#ff9800');
      case 'hard':
      default:
        return this.getThemeColor('--color-error', '#f44336');
    }
  }

  private getThemeColor(variable: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return value || fallback;
  }

  private withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const bigint = parseInt(hex.length === 3
        ? hex.split('').map(c => c + c).join('')
        : hex, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }

    return color;
  }
}
