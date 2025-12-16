import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, StatCardConfig, BadgeComponent } from '../../../shared/components';
import { FlashcardDeck, UserDeckReference } from '../../../models';
import { combineLatest, forkJoin, of, timeout } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

type TabType = 'owned' | 'co-authored' | 'public';

@Component({
  selector: 'app-lernen-list',
  standalone: true,
  imports: [CommonModule, RouterModule, PullToRefreshDirective, SkeletonLoaderComponent, StatCardComponent, BadgeComponent],
  templateUrl: './lernen-list.component.html',
  styleUrls: ['./lernen-list.component.scss']
})
export class LernenListComponent implements OnInit {
  private deckService = inject(FlashcardDeckService);
  private participantService = inject(DeckParticipantService);
  private flashcardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ownedDecks = signal<FlashcardDeck[]>([]);
  coAuthoredDecks = signal<FlashcardDeck[]>([]);
  publicDecks = signal<FlashcardDeck[]>([]);
  userDeckRefs = signal<UserDeckReference[]>([]);
  ownedSearchTerm = signal('');
  coAuthorSearchTerm = signal('');
  publicSearchTerm = signal('');

  filteredOwnedDecks = computed(() => this.filterByTerm(this.ownedDecks(), this.ownedSearchTerm()));
  filteredCoAuthoredDecks = computed(() => this.filterByTerm(this.coAuthoredDecks(), this.coAuthorSearchTerm()));
  filteredPublicDecks = computed(() => this.filterByTerm(this.publicDecks(), this.publicSearchTerm()));

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
  displayedDeckCount = computed(() => this.displayedDecks().length);
  displayedCardCount = computed(() =>
    this.displayedDecks().reduce((sum, deck) => sum + (deck.cardCount || 0), 0)
  );
  latestUpdatedDate = computed<Date | null>(() => {
    const decks = this.displayedDecks();
    if (!decks.length) return null;

    return decks.reduce((latest, deck) =>
      deck.updatedAt.getTime() > latest.getTime() ? deck.updatedAt : latest,
      decks[0].updatedAt
    );
  });

  currentUser = this.authService.currentUser;
  enrollmentState = signal<Record<string, 'idle' | 'loading' | 'removing' | 'error'>>({});
  joinCode = signal('');
  joinError = signal<string | null>(null);
  joinBusy = signal(false);
  fabOpen = signal(false);

  userDeckRoleMap = computed(() => {
    const map = new Map<string, UserDeckReference['role']>();
    this.userDeckRefs().forEach(ref => map.set(ref.deckId, ref.role));
    return map;
  });

  displayedDecks = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return this.filteredOwnedDecks();
      case 'co-authored':
        return this.filteredCoAuthoredDecks();
      case 'public':
        return this.filteredPublicDecks();
    }
  });

  ngOnInit(): void {
    this.loadDecks();
  }

  private loadDecks(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    const QUERY_TIMEOUT = 8000;  // 8 seconds per query
    const TOTAL_TIMEOUT = 15000; // 15 seconds for entire operation

    combineLatest([
      this.deckService.getDecksForUser(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading owned decks:', error);
          return of([] as FlashcardDeck[]);
        })
      ),
      this.participantService.getUserDecks(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading user deck refs:', error);
          return of([] as UserDeckReference[]);
        })
      ),
      this.deckService.getPublicDecks().pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading public decks:', error);
          return of([] as FlashcardDeck[]);
        })
      )
    ]).pipe(
      timeout(TOTAL_TIMEOUT),
      takeUntilDestroyed(this.destroyRef),
      switchMap(([owned, userDeckRefs, publicDecks]) => {
        this.ownedDecks.set(owned.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
        this.userDeckRefs.set(userDeckRefs);

        const coAuthorRefs = userDeckRefs.filter(ref => ref.role === 'co-author');
        const participantRefs = userDeckRefs.filter(ref => ref.role === 'student');

        // Fetch Deck objects for co-authored and participant decks using batch query
        const coAuthorIds = coAuthorRefs.map(ref => ref.deckId);
        const participantIds = participantRefs.map(ref => ref.deckId);

        const coAuthor$ = coAuthorIds.length > 0
          ? this.deckService.getDecksByIds(coAuthorIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading co-author decks:', error);
                return of([] as FlashcardDeck[]);
              })
            )
          : of([] as FlashcardDeck[]);

        const participant$ = participantIds.length > 0
          ? this.deckService.getDecksByIds(participantIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading participant decks:', error);
                return of([] as FlashcardDeck[]);
              })
            )
          : of([] as FlashcardDeck[]);

        return forkJoin([coAuthor$, participant$]).pipe(
          timeout(QUERY_TIMEOUT),
          map(([coAuthorDecks, participantDecks]) => ({
            coAuthorDecks,
            participantDecks,
            publicDecks
          })),
          catchError(error => {
            console.error('Error loading co-author/participant decks:', error);
            return of({ coAuthorDecks: [] as FlashcardDeck[], participantDecks: [] as FlashcardDeck[], publicDecks });
          })
        );
      }),
      catchError(error => {
        console.error('Critical error in deck loading:', error);
        this.error.set('Failed to load decks. Please refresh the page.');
        this.isLoading.set(false);
        return of({ coAuthorDecks: [] as FlashcardDeck[], participantDecks: [] as FlashcardDeck[], publicDecks: [] as FlashcardDeck[] });
      })
    ).subscribe({
      next: ({ coAuthorDecks, participantDecks, publicDecks }) => {
        this.coAuthoredDecks.set(coAuthorDecks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        const publicDeckIds = new Set(publicDecks.map(d => d.id));
        const uniqueParticipantDecks = participantDecks.filter(d => !publicDeckIds.has(d.id));

        const allPublicDecks = [...publicDecks, ...uniqueParticipantDecks];
        this.publicDecks.set(allPublicDecks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

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
    this.loadDecks();
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

  private filterByTerm(decks: FlashcardDeck[], term: string): FlashcardDeck[] {
    const needle = term.trim().toLowerCase();
    if (!needle) return decks;

    return decks.filter(deck => {
      const titleMatch = deck.title.toLowerCase().includes(needle);
      const descriptionMatch = (deck.description || '').toLowerCase().includes(needle);
      return titleMatch || descriptionMatch;
    });
  }

  createNewDeck(): void {
    this.router.navigate(['/lernen/deck-editor', 'new']);
  }

  editDeck(deckId: string): void {
    this.router.navigate(['/lernen/deck-editor', deckId]);
  }

  viewDetails(deckId: string): void {
    this.router.navigate(['/lernen/deck', deckId]);
  }

  startStudy(deck: FlashcardDeck): void {
    if (this.requiresEnrollment(deck) && !this.isEnrolled(deck.id)) {
      this.toastService.warning('Bitte füge dich zuerst zu diesem Deck hinzu');
      return;
    }
    this.router.navigate(['/lernen/deck', deck.id, 'study']);
  }

  requiresEnrollment(deck: FlashcardDeck): boolean {
    return deck.visibility === 'public' && !this.isOwner(deck) && !this.isCoAuthor(deck);
  }

  isEnrolled(deckId: string): boolean {
    return this.userDeckRoleMap().get(deckId) === 'student';
  }

  isCoAuthor(deck: FlashcardDeck): boolean {
    return this.userDeckRoleMap().get(deck.id) === 'co-author';
  }

  isEnrolling(deckId: string): boolean {
    return this.enrollmentState()[deckId] === 'loading';
  }

  isUnenrolling(deckId: string): boolean {
    return this.enrollmentState()[deckId] === 'removing';
  }

  isEnrollmentBusy(deckId: string): boolean {
    const state = this.enrollmentState()[deckId];
    return state === 'loading' || state === 'removing';
  }

  private updateEnrollmentState(deckId: string, state: 'idle' | 'loading' | 'removing' | 'error'): void {
    this.enrollmentState.update(current => ({ ...current, [deckId]: state }));
  }

  async enrollInDeck(deck: FlashcardDeck): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.requiresEnrollment(deck) || this.isEnrolled(deck.id) || this.isEnrolling(deck.id)) {
      return;
    }

    // Optimistic update
    const optimisticRef: UserDeckReference = {
      deckId: deck.id,
      role: 'student',
      addedAt: new Date(),
      lastAccessedAt: new Date()
    };

    this.userDeckRefs.update(refs => [...refs, optimisticRef]);
    this.updateEnrollmentState(deck.id, 'loading');

    try {
      await this.participantService.addParticipant(
        deck.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );

      this.updateEnrollmentState(deck.id, 'idle');
      this.toastService.success(`"${deck.title}" hinzugefügt`);
    } catch (err) {
      console.error('Error enrolling in deck:', err);
      this.userDeckRefs.update(refs => refs.filter(ref => ref.deckId !== deck.id));
      this.updateEnrollmentState(deck.id, 'error');
      this.toastService.error('Deck konnte nicht hinzugefügt werden');
    }
  }

  async unenrollFromDeck(deck: FlashcardDeck): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.isEnrolled(deck.id) || this.isUnenrolling(deck.id)) {
      return;
    }

    const previousRefs = this.userDeckRefs();

    this.userDeckRefs.update(refs => refs.filter(ref => ref.deckId !== deck.id));
    this.updateEnrollmentState(deck.id, 'removing');

    try {
      await this.participantService.removeParticipant(deck.id, user.uid);

      this.updateEnrollmentState(deck.id, 'idle');
      this.toastService.success(`"${deck.title}" entfernt`);
    } catch (err) {
      console.error('Error removing deck enrollment:', err);
      this.userDeckRefs.set(previousRefs);
      this.updateEnrollmentState(deck.id, 'error');
      this.toastService.error('Deck konnte nicht entfernt werden');
    }
  }

  async deleteDeck(deck: FlashcardDeck): Promise<void> {
    if (!confirm(`Are you sure you want to delete "${deck.title}"? This will also delete all flashcards, progress data, and participant records. This action cannot be undone.`)) {
      return;
    }

    try {
      await this.deckService.deleteDeckWithCleanup(
        deck.id,
        this.flashcardService,
        this.progressService,
        this.participantService
      );
      this.ownedDecks.update(decks => decks.filter(d => d.id !== deck.id));
      this.toastService.success(`"${deck.title}" wurde gelöscht`);
    } catch (err: any) {
      console.error('Error deleting deck:', err);
      this.toastService.error(`Löschen fehlgeschlagen: ${err.message}`, 5000);
    }
  }

  canEdit(deck: FlashcardDeck): boolean {
    const userId = this.currentUser()?.uid;
    if (!userId) return false;

    return userId === deck.ownerId || this.isCoAuthor(deck);
  }

  isOwner(deck: FlashcardDeck): boolean {
    return this.currentUser()?.uid === deck.ownerId;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
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
      const deck = await new Promise<FlashcardDeck | null>((resolve, reject) => {
        this.deckService.getDeckByJoinCode(code).subscribe({
          next: resolve,
          error: reject
        });
      });

      if (!deck) {
        this.joinError.set('Kein Deck mit diesem Code gefunden.');
        this.joinBusy.set(false);
        return;
      }

      const existingRef = this.userDeckRefs().find(ref => ref.deckId === deck.id);
      if (existingRef) {
        this.joinError.set('Du bist diesem Deck bereits beigetreten.');
        this.joinBusy.set(false);
        return;
      }

      await this.participantService.addParticipant(
        deck.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );

      const newRef: UserDeckReference = {
        deckId: deck.id,
        role: 'student',
        addedAt: new Date(),
        lastAccessedAt: new Date()
      };

      this.userDeckRefs.update(refs => [...refs, newRef]);

      this.joinCode.set('');
      this.joinError.set(null);
      this.joinBusy.set(false);

      const toggleCheckbox = document.getElementById('join-toggle') as HTMLInputElement;
      if (toggleCheckbox) {
        toggleCheckbox.checked = false;
      }

      this.router.navigate(['/lernen/deck', deck.id]);
    } catch (err: any) {
      console.error('Error joining deck by code:', err);
      this.joinError.set('Fehler beim Beitreten: ' + (err.message || 'Unbekannter Fehler'));
      this.joinBusy.set(false);
    }
  }
}
