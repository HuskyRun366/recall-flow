import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { PwaDetectionService } from '../../../core/services/pwa-detection.service';
import { SkeletonLoaderComponent, StatCardComponent, StatCardConfig, ProgressBarComponent } from '../../../shared/components';
import { FlashcardDeck, CardProgress } from '../../../models';
import { combineLatest, of } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

interface DeckWithProgress {
  deck: FlashcardDeck;
  progress: { [key: string]: CardProgress };
  totalCards: number;
  userCanEdit?: boolean;
}

@Component({
  selector: 'app-lernen-home',
  standalone: true,
  imports: [CommonModule, RouterModule, SkeletonLoaderComponent, StatCardComponent, ProgressBarComponent],
  templateUrl: './lernen-home.component.html',
  styleUrls: ['./lernen-home.component.scss']
})
export class LernenHomeComponent implements OnInit {
  private deckService = inject(FlashcardDeckService);
  private progressService = inject(FlashcardProgressService);
  private participantService = inject(DeckParticipantService);
  private authService = inject(AuthService);
  private pwaDetection = inject(PwaDetectionService);
  private destroyRef = inject(DestroyRef);

  decksWithProgress = signal<DeckWithProgress[]>([]);
  searchTerm = signal('');
  filteredDecks = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const list = this.decksWithProgress();
    if (!term) return list;

    return list.filter(item => {
      const title = (item.deck.title || '').toLowerCase();
      const desc = (item.deck.description || '').toLowerCase();
      return title.includes(term) || desc.includes(term);
    });
  });
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;
  isPWA = this.pwaDetection.isPWA;

  // Computed statistics
  totalDecks = computed(() => this.decksWithProgress().length);
  totalFlashcards = computed(() =>
    this.decksWithProgress().reduce((sum, dwp) => sum + dwp.totalCards, 0)
  );

  // Progress level distribution
  levelDistribution = computed(() => {
    const decks = this.decksWithProgress();
    const totals = { level0: 0, level1: 0, level2: 0, level3: 0 };

    decks.forEach(dwp => {
      Object.values(dwp.progress).forEach(cardProgress => {
        if (cardProgress.level === 0) totals.level0++;
        else if (cardProgress.level === 1) totals.level1++;
        else if (cardProgress.level === 2) totals.level2++;
        else if (cardProgress.level === 3) totals.level3++;
      });
    });

    return totals;
  });

  overallProgress = computed(() => {
    const dist = this.levelDistribution();
    const total = dist.level0 + dist.level1 + dist.level2 + dist.level3;
    if (total === 0) return 0;

    const weighted = dist.level1 + dist.level2 * 2 + dist.level3 * 3;
    return Math.round((weighted / (total * 3)) * 100);
  });

  // Recent decks (last 5 updated)
  recentDecks = computed(() => {
    return this.decksWithProgress()
      .sort((a, b) => {
        const dateA = a.deck.updatedAt instanceof Date ? a.deck.updatedAt : new Date(a.deck.updatedAt);
        const dateB = b.deck.updatedAt instanceof Date ? b.deck.updatedAt : new Date(b.deck.updatedAt);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 5);
  });

  // Stat card configs
  totalDecksConfig = computed<StatCardConfig>(() => ({
    icon: 'svg',
    iconContent: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 11h20"/>',
    value: this.totalDecks(),
    label: 'Decks'
  }));

  totalCardsConfig = computed<StatCardConfig>(() => ({
    icon: 'svg',
    iconContent: '<path d="M9 11H3v9h6v-9Z M21 11h-6v9h6v-9Z M15 5H9v14h6V5Z"/>',
    value: this.totalFlashcards(),
    label: 'Flashcards'
  }));

  progressConfig = computed<StatCardConfig>(() => ({
    icon: 'svg',
    iconContent: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    value: this.overallProgress() + '%',
    label: 'Fortschritt'
  }));

  // Progress bar config
  progressBarConfig = computed(() => {
    const dist = this.levelDistribution();
    const total = dist.level0 + dist.level1 + dist.level2 + dist.level3;

    return {
      items: [
        {
          level: 0 as const,
          label: 'Nicht trainiert',
          count: dist.level0,
          percentage: total > 0 ? Math.round((dist.level0 / total) * 100) : 0
        },
        {
          level: 1 as const,
          label: '1x trainiert',
          count: dist.level1,
          percentage: total > 0 ? Math.round((dist.level1 / total) * 100) : 0
        },
        {
          level: 2 as const,
          label: '2x trainiert',
          count: dist.level2,
          percentage: total > 0 ? Math.round((dist.level2 / total) * 100) : 0
        },
        {
          level: 3 as const,
          label: 'Perfekt trainiert',
          count: dist.level3,
          percentage: total > 0 ? Math.round((dist.level3 / total) * 100) : 0
        }
      ],
      showCount: true
    };
  });

  ngOnInit(): void {
    this.loadDecks();
  }

  private loadDecks(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('Nicht angemeldet');
      this.isLoading.set(false);
      return;
    }

    this.deckService.getDecksForUser(userId)
      .pipe(
        switchMap((decks: FlashcardDeck[]) => {
          if (decks.length === 0) {
            return of([]);
          }

          // Load progress for each deck
          const decksWithProgressObs = decks.map((deck: FlashcardDeck) =>
            this.progressService.getCardProgress(deck.id!, userId).pipe(
              map(cardProgressArray => {
                // Convert array to dictionary
                const progressDict: { [key: string]: CardProgress } = {};
                cardProgressArray.forEach(cp => {
                  progressDict[cp.cardId] = cp;
                });

                return {
                  deck,
                  progress: progressDict,
                  totalCards: deck.cardCount || 0,
                  userCanEdit: true // TODO: Check actual permissions
                };
              }),
              catchError(err => {
                console.error(`Error loading progress for deck ${deck.id}:`, err);
                return of({
                  deck,
                  progress: {},
                  totalCards: deck.cardCount || 0,
                  userCanEdit: true
                });
              })
            )
          );

          return combineLatest(decksWithProgressObs);
        }),
        catchError(err => {
          console.error('Error loading decks:', err);
          this.error.set('Fehler beim Laden der Decks');
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(decksWithProgress => {
        this.decksWithProgress.set(decksWithProgress);
        this.isLoading.set(false);
      });
  }

  refreshData(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.loadDecks();
  }
}
