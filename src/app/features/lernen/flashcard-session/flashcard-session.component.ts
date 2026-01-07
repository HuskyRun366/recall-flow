import { Component, OnInit, signal, computed, inject, DestroyRef, HostListener, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdaptiveLearningService } from '../../../core/services/adaptive-learning.service';
import { FlashcardComponent } from '../../quiz-taking/components/flashcard/flashcard.component';
import { StatCardComponent } from '../../../shared/components';
import { FlashcardDeck, Flashcard, Question, CardProgress } from '../../../models';
import { combineLatest, forkJoin, of, from } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

interface FlashcardWithProgress {
  flashcard: Flashcard;
  progress: CardProgress;
  question: Question; // Converted format for FlashcardComponent
}

@Component({
  selector: 'app-flashcard-session',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StatCardComponent, FlashcardComponent],
  templateUrl: './flashcard-session.component.html',
  styleUrls: ['./flashcard-session.component.scss']
})
export class FlashcardSessionComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private deckService = inject(FlashcardDeckService);
  private cardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private authService = inject(AuthService);
  private adaptiveLearning = inject(AdaptiveLearningService);
  private destroyRef = inject(DestroyRef);
  private cardStartAt = Date.now();
  private lastCardId: string | null = null;
  private repeatCounts = new Map<string, number>();
  private readonly repeatLimit = 2;
  private readonly repeatSpacing = 3;

  @ViewChild(FlashcardComponent) flashcardComponent?: FlashcardComponent;

  deck = signal<FlashcardDeck | null>(null);
  cards = signal<FlashcardWithProgress[]>([]);
  currentCardIndex = signal(0);
  isLoading = signal(true);
  error = signal<string | null>(null);
  isCompleted = signal(false);

  currentUser = this.authService.currentUser;
  deckId = signal<string | null>(null);

  // Computed values
  currentCard = computed(() => {
    const index = this.currentCardIndex();
    const cardsList = this.cards();
    return cardsList[index] || null;
  });

  adaptiveInfo = computed(() => {
    const card = this.currentCard();
    if (!card) {
      return null;
    }

    const userId = this.currentUser()?.uid;
    const rawDueInDays = this.adaptiveLearning.getDaysUntilDue(card.progress);
    const difficulty = card.progress.difficulty ?? 0.5;
    const difficultyLabel = this.adaptiveLearning.getDifficultyLabel(difficulty);
    const forgetInDays = this.adaptiveLearning.predictForgetInDays(card.progress, userId);

    return {
      dueInDays: Math.max(0, rawDueInDays),
      isDue: rawDueInDays <= 0,
      difficultyLabelKey: `session.adaptive.difficultyLabels.${difficultyLabel}`,
      forgetInDays
    };
  });

  progress = computed(() => {
    const total = this.cards().length;
    const current = this.currentCardIndex();
    return total > 0 ? Math.round((current / total) * 100) : 0;
  });

  cardsRemaining = computed(() => this.cards().length - this.currentCardIndex());

  // Statistics for completion screen
  totalCards = computed(() => this.cards().length);
  correctAnswers = signal(0);
  incorrectAnswers = signal(0);

  constructor() {
    effect(() => {
      const current = this.currentCard();
      const id = current?.flashcard.id ?? null;
      if (id && id !== this.lastCardId) {
        this.lastCardId = id;
        this.cardStartAt = Date.now();
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Deck ID is required');
      this.isLoading.set(false);
      return;
    }

    this.deckId.set(id);
    this.loadSession();
  }

  private loadSession(): void {
    const id = this.deckId();
    const userId = this.currentUser()?.uid;

    if (!id || !userId) {
      this.error.set('Authentication required');
      this.isLoading.set(false);
      return;
    }

    combineLatest([
      this.deckService.getDeckById(id),
      this.cardService.getFlashcardsByDeckId(id)
    ]).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(([deck, flashcards]) => {
        if (!deck) {
          throw new Error('Deck not found');
        }

        this.deck.set(deck);

        if (flashcards.length === 0) {
          throw new Error('This deck has no cards');
        }

        // Initialize progress if needed
        const cardIds = flashcards.map(c => c.id);
        return from(this.progressService.initializeProgress(id, userId, cardIds)).pipe(
          switchMap(() => {
            // Load progress for all cards
            const progressObservables = flashcards.map(card =>
              this.progressService.getSingleCardProgress(id, userId, card.id).pipe(
                catchError(() => of(null))
              )
            );

            return forkJoin(progressObservables).pipe(
              map(progressList => {
                const cards = flashcards.map((flashcard, index) => {
                  const progress = progressList[index] || {
                    cardId: flashcard.id,
                    level: 0,
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
                  };

                  return {
                    flashcard,
                    progress,
                    question: this.convertToQuestion(flashcard)
                  };
                });

                return this.adaptiveLearning.sortByPriority(cards);
              })
            );
          })
        );
      }),
      catchError(err => {
        console.error('Error loading session:', err);
        this.error.set(err.message || 'Failed to load session');
        return of([]);
      })
    ).subscribe({
      next: (cardsWithProgress) => {
        this.cards.set(cardsWithProgress);
        this.currentCardIndex.set(0);
        this.repeatCounts.clear();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error:', err);
        this.error.set('Failed to load session. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private convertToQuestion(flashcard: Flashcard): Question {
    // Convert flashcard to Question format that FlashcardComponent expects
    return {
      id: flashcard.id,
      quizId: flashcard.deckId, // Use deckId as quizId
      type: 'multiple-choice',
      questionText: flashcard.front,
      orderIndex: flashcard.orderIndex,
      options: [
        {
          id: `${flashcard.id}-option-1`,
          text: flashcard.back,
          isCorrect: true
        }
      ],
      createdAt: flashcard.createdAt,
      updatedAt: flashcard.updatedAt
    };
  }

  async handleAnswer(isCorrect: boolean): Promise<void> {
    const card = this.currentCard();
    const userId = this.currentUser()?.uid;
    const deckId = this.deckId();

    if (!card || !userId || !deckId) return;

    const responseTimeMs = Math.max(0, Date.now() - this.cardStartAt);

    // Update statistics
    if (isCorrect) {
      this.correctAnswers.update(count => count + 1);
    } else {
      this.incorrectAnswers.update(count => count + 1);
    }

    if (!isCorrect) {
      this.scheduleRepeat(card);
    }

    // Move to next card immediately (optimistic UI)
    await this.nextCard();

    // Update progress in the background
    this.progressService.updateCardProgress(
      deckId,
      userId,
      card.flashcard.id,
      isCorrect,
      responseTimeMs
    ).then((updatedProgress) => {
      this.updateLocalProgress(card.flashcard.id, updatedProgress);
    }).catch((err) => {
      console.error('Error updating progress:', err);
    });
  }

  async nextCard(): Promise<void> {
    const nextIndex = this.currentCardIndex() + 1;

    if (nextIndex >= this.cards().length) {
      // Session completed
      this.isCompleted.set(true);
    } else {
      this.currentCardIndex.set(nextIndex);
    }
  }

  restartSession(): void {
    this.currentCardIndex.set(0);
    this.correctAnswers.set(0);
    this.incorrectAnswers.set(0);
    this.isCompleted.set(false);
    this.repeatCounts.clear();
  }

  goToDeck(): void {
    this.router.navigate(['/lernen']);
  }

  editDeck(): void {
    const deckId = this.deckId();
    if (deckId) {
      this.router.navigate(['/lernen/deck-editor', deckId]);
    }
  }

  // Keyboard shortcuts
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (this.isLoading() || this.isCompleted()) return;

    const card = this.currentCard();
    if (!card || !this.flashcardComponent) return;

    // Space or Enter to flip
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.flashcardComponent.flip();
    }

    // Arrow keys for known/unknown (only when flipped)
    if (this.flashcardComponent.isFlipped()) {
      if (event.key === 'ArrowRight' || event.key === 'y' || event.key === 'Y') {
        event.preventDefault();
        this.flashcardComponent.markAsKnown(); // This resets flip state and emits event
      } else if (event.key === 'ArrowLeft' || event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        this.flashcardComponent.markAsUnknown(); // This resets flip state and emits event
      }
    }
  }

  getLevelColor(level: number): string {
    switch (level) {
      case 0: return 'var(--level-0-color)';
      case 1: return 'var(--level-1-color)';
      case 2: return 'var(--level-2-color)';
      case 3: return 'var(--level-3-color)';
      default: return 'var(--level-0-color)';
    }
  }

  getSuccessRate(): number {
    const total = this.correctAnswers() + this.incorrectAnswers();
    return total > 0 ? Math.round((this.correctAnswers() / total) * 100) : 0;
  }

  private updateLocalProgress(cardId: string, progress: CardProgress): void {
    const next = this.cards().map(card =>
      card.flashcard.id === cardId ? { ...card, progress } : card
    );
    this.cards.set(next);
  }

  private scheduleRepeat(card: FlashcardWithProgress): void {
    const cardId = card.flashcard.id;
    const repeats = this.repeatCounts.get(cardId) ?? 0;
    if (repeats >= this.repeatLimit) {
      return;
    }

    this.repeatCounts.set(cardId, repeats + 1);

    const cards = [...this.cards()];
    const insertIndex = Math.min(this.currentCardIndex() + this.repeatSpacing, cards.length);
    cards.splice(insertIndex, 0, {
      ...card,
      progress: { ...card.progress }
    });
    this.cards.set(cards);
  }
}
