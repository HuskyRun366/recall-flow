import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlashcardDeckService } from '../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../core/services/flashcard-progress.service';
import { DeckParticipantService } from '../../core/services/deck-participant.service';
import { AuthService } from '../../core/services/auth.service';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, StatCardConfig } from '../../shared/components';
import { FlashcardDeck, DeckProgressSummary, UserDeckReference } from '../../models';
import { combineLatest, forkJoin, of } from 'rxjs';
import { switchMap, catchError, map, timeout } from 'rxjs/operators';

interface DeckWithProgress {
  deck: FlashcardDeck;
  progress: DeckProgressSummary;
  totalCards: number;
  userCanEdit?: boolean;
}

@Component({
  selector: 'app-lernen',
  standalone: true,
  imports: [CommonModule, RouterModule, SkeletonLoaderComponent, StatCardComponent],
  templateUrl: './lernen.component.html',
  styleUrls: ['./lernen.component.scss']
})
export class LernenComponent implements OnInit {
  private deckService = inject(FlashcardDeckService);
  private cardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private participantService = inject(DeckParticipantService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  decksWithProgress = signal<DeckWithProgress[]>([]);
  userDeckRefs = signal<UserDeckReference[]>([]);
  searchTerm = signal('');
  fabOpen = signal(false);

  filteredDecks = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const list = this.decksWithProgress();
    if (!term) return list;

    return list.filter(item => {
      const title = (item.deck.title || '').toLowerCase();
      const desc = (item.deck.description || '').toLowerCase();
      const tags = item.deck.tags.map(t => t.toLowerCase()).join(' ');
      return title.includes(term) || desc.includes(term) || tags.includes(term);
    });
  });

  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;

  // Computed statistics
  totalDecks = computed(() => this.decksWithProgress().length);

  totalCards = computed(() =>
    this.decksWithProgress().reduce((sum, dwp) => sum + dwp.totalCards, 0)
  );

  overallProgress = computed(() => {
    const decks = this.decksWithProgress();
    if (decks.length === 0) return 0;

    const totalCards = decks.reduce((sum, dwp) => sum + dwp.totalCards, 0);
    if (totalCards === 0) return 0;

    const trainedCards = decks.reduce(
      (sum, dwp) =>
        sum +
        dwp.progress.level1Count +
        dwp.progress.level2Count * 2 +
        dwp.progress.level3Count * 3,
      0
    );

    return Math.round((trainedCards / (totalCards * 3)) * 100);
  });

  // Weak areas: decks with high percentage of level 0 cards
  weakAreas = computed(() => {
    const decks = this.decksWithProgress();
    if (decks.length === 0) return [];

    return decks
      .filter(dwp => dwp.progress.level0Count > 0)
      .map(dwp => ({
        ...dwp,
        weakPercentage: Math.round((dwp.progress.level0Count / dwp.totalCards) * 100)
      }))
      .sort((a, b) => b.weakPercentage - a.weakPercentage)
      .slice(0, 3);
  });

  totalWeakCards = computed(() => {
    const decks = this.decksWithProgress();
    return decks.reduce((sum, dwp) => sum + dwp.progress.level0Count, 0);
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

    // Load decks using proper RxJS chain
    combineLatest([
      this.participantService.getUserDecks(userId),
      this.deckService.getDecksForUser(userId)
    ]).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(([userDeckRefs, ownedDecks]) => {
        this.userDeckRefs.set(userDeckRefs);

        const userDeckIds = userDeckRefs.map(ref => ref.deckId);

        // Fetch Deck objects for user references using batch query
        const userDecks$ = userDeckIds.length > 0
          ? this.deckService.getDecksByIds(userDeckIds).pipe(
              catchError(() => of([] as FlashcardDeck[]))
            )
          : of([] as FlashcardDeck[]);

        return userDecks$.pipe(
          map(userDecks => {
            return this.deduplicateDecks([...userDecks, ...ownedDecks]);
          })
        );
      }),
      switchMap(allDecks => this.loadProgressForDecks(allDecks, userId))
    ).subscribe({
      next: (decksWithProgress) => {
        this.decksWithProgress.set(decksWithProgress);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading decks:', err);
        this.error.set('Failed to load decks. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private deduplicateDecks(decks: FlashcardDeck[]): FlashcardDeck[] {
    const uniqueMap = new Map<string, FlashcardDeck>();
    decks.forEach(deck => {
      if (!uniqueMap.has(deck.id)) {
        uniqueMap.set(deck.id, deck);
      }
    });
    return Array.from(uniqueMap.values());
  }

  private loadProgressForDecks(decks: FlashcardDeck[], userId: string) {
    if (decks.length === 0) {
      return of([] as DeckWithProgress[]);
    }

    const progressObservables = decks.map(deck =>
      this.progressService.getProgressSummary(deck.id, userId).pipe(
        catchError(() => of({
          totalCards: deck.cardCount,
          level0Count: deck.cardCount,
          level1Count: 0,
          level2Count: 0,
          level3Count: 0,
          completionRate: 0,
          lastStudyAt: undefined
        }))
      )
    );

    return forkJoin(progressObservables).pipe(
      timeout(10000),
      catchError(error => {
        console.error('Error loading progress:', error);
        return of(decks.map(deck => ({
          totalCards: deck.cardCount,
          level0Count: deck.cardCount,
          level1Count: 0,
          level2Count: 0,
          level3Count: 0,
          completionRate: 0,
          lastStudyAt: undefined
        })));
      }),
      map(progressSummaries => {
        return decks.map((deck, index) => {
          const progress = progressSummaries[index];
          const userRole = this.userDeckRefs().find(ref => ref.deckId === deck.id)?.role;

          return {
            deck,
            progress,
            totalCards: deck.cardCount,
            userCanEdit: deck.ownerId === userId || userRole === 'co-author'
          };
        });
      })
    );
  }

  retry(): void {
    this.loadData();
  }

  toggleFab(): void {
    this.fabOpen.update(open => !open);
  }

  getProgressClass(progress: DeckProgressSummary): string {
    const rate = progress.completionRate;
    if (rate === 0) return 'progress-none';
    if (rate < 33) return 'progress-low';
    if (rate < 67) return 'progress-medium';
    return 'progress-high';
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

  async deleteDeck(deckId: string, deckTitle: string): Promise<void> {
    const confirmed = confirm(`Möchtest du "${deckTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);

    if (!confirmed) {
      return;
    }

    try {
      await this.deckService.deleteDeckWithCleanup(
        deckId,
        this.cardService,
        this.progressService,
        this.participantService
      );

      // Reload data after deletion
      this.loadData();
    } catch (err) {
      console.error('Error deleting deck:', err);
      alert('Fehler beim Löschen des Decks');
    }
  }
}
