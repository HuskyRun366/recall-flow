import { Component, OnInit, signal, computed, inject, DestroyRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { AuthService } from '../../../core/services/auth.service';
import { FlashcardComponent } from '../../quiz-taking/components/flashcard/flashcard.component';
import { FlashcardDeck, Flashcard, Question, CardProgress } from '../../../models';
import { combineLatest, forkJoin, of, from } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

interface FlashcardWithProgress {
  flashcard: Flashcard;
  progress: CardProgress | null;
  question: Question; // Converted format for FlashcardComponent
}

@Component({
  selector: 'app-flashcard-session',
  standalone: true,
  imports: [CommonModule, RouterModule, FlashcardComponent],
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
  private destroyRef = inject(DestroyRef);

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
                return flashcards.map((flashcard, index) => ({
                  flashcard,
                  progress: progressList[index],
                  question: this.convertToQuestion(flashcard)
                }));
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

    // Update statistics
    if (isCorrect) {
      this.correctAnswers.update(count => count + 1);
    } else {
      this.incorrectAnswers.update(count => count + 1);
    }

    try {
      // Update progress in Firestore
      await this.progressService.updateCardProgress(
        deckId,
        userId,
        card.flashcard.id,
        isCorrect
      );

      // Move to next card
      await this.nextCard();
    } catch (err) {
      console.error('Error updating progress:', err);
      this.error.set('Failed to update progress');
    }
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
    if (!card) return;

    // Space or Enter to flip
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const flashcardElement = document.querySelector('app-flashcard');
      if (flashcardElement) {
        (flashcardElement as any).flip();
      }
    }

    // Arrow keys for known/unknown (only when flipped)
    const flashcardComponent = document.querySelector('app-flashcard');
    if (flashcardComponent) {
      const isFlipped = (flashcardComponent as any).isFlipped?.();

      if (isFlipped) {
        if (event.key === 'ArrowRight' || event.key === 'y' || event.key === 'Y') {
          event.preventDefault();
          this.handleAnswer(true);
        } else if (event.key === 'ArrowLeft' || event.key === 'n' || event.key === 'N') {
          event.preventDefault();
          this.handleAnswer(false);
        }
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
}
