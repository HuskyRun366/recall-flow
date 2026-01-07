import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { FolderService } from '../../../core/services/folder.service';
import { TagService } from '../../../core/services/tag.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, StatCardConfig, BadgeComponent, SearchBarComponent, FavoriteButtonComponent } from '../../../shared/components';
import { FolderSidebarComponent } from '../../../shared/components/folder-sidebar/folder-sidebar.component';
import { FolderDialogComponent, FolderDialogData, FolderDialogResult } from '../../../shared/components/folder-dialog/folder-dialog.component';
import { FlashcardDeck, UserDeckReference, Folder } from '../../../models';
import { combineLatest, forkJoin, of, timeout } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

type TabType = 'owned' | 'co-authored' | 'public';

@Component({
  selector: 'app-lernen-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    PullToRefreshDirective,
    SkeletonLoaderComponent,
    StatCardComponent,
    BadgeComponent,
    SearchBarComponent,
    FavoriteButtonComponent,
    FolderSidebarComponent,
    FolderDialogComponent
  ],
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
  private folderService = inject(FolderService);
  private tagService = inject(TagService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ownedDecks = signal<FlashcardDeck[]>([]);
  coAuthoredDecks = signal<FlashcardDeck[]>([]);
  publicDecks = signal<FlashcardDeck[]>([]);
  userDeckRefs = signal<UserDeckReference[]>([]);
  ownedSearchTerm = signal('');
  coAuthorSearchTerm = signal('');
  publicSearchTerm = signal('');

  // Folder/Favorites state
  folders = signal<Folder[]>([]);
  selectedFolderId = signal<string | null>(null);
  showFavoritesOnly = signal(false);
  availableTags = signal<string[]>([]);
  selectedTags = signal<string[]>([]);
  sidebarCollapsed = signal(true);
  folderDialogOpen = signal(false);
  folderDialogData = signal<FolderDialogData | null>(null);

  selectedFolder = computed(() => {
    const folderId = this.selectedFolderId();
    if (!folderId) return null;
    return this.folders().find(f => f.id === folderId) ?? null;
  });

  filteredOwnedDecks = computed(() => {
    let list = this.applyFolderAndFavoritesFilter(this.ownedDecks());
    return this.filterByTerm(list, this.ownedSearchTerm());
  });

  filteredCoAuthoredDecks = computed(() => {
    let list = this.applyFolderAndFavoritesFilter(this.coAuthoredDecks());
    return this.filterByTerm(list, this.coAuthorSearchTerm());
  });

  filteredPublicDecks = computed(() => {
    let list = this.applyFolderAndFavoritesFilter(this.publicDecks());
    return this.filterByTerm(list, this.publicSearchTerm());
  });

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

  searchPlaceholder = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return 'lernen.list.searchPlaceholder.owned';
      case 'co-authored':
        return 'lernen.list.searchPlaceholder.coAuthored';
      case 'public':
        return 'lernen.list.searchPlaceholder.public';
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
    this.loadFolders();
    this.loadTags();
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
      )
    ]).pipe(
      timeout(TOTAL_TIMEOUT),
      takeUntilDestroyed(this.destroyRef),
      switchMap(([owned, userDeckRefs]) => {
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
            participantDecks
          })),
          catchError(error => {
            console.error('Error loading co-author/participant decks:', error);
            return of({ coAuthorDecks: [] as FlashcardDeck[], participantDecks: [] as FlashcardDeck[] });
          })
        );
      }),
      catchError(error => {
        console.error('Critical error in deck loading:', error);
        this.error.set('Failed to load decks. Please refresh the page.');
        this.isLoading.set(false);
        return of({ coAuthorDecks: [] as FlashcardDeck[], participantDecks: [] as FlashcardDeck[] });
      })
    ).subscribe({
      next: ({ coAuthorDecks, participantDecks }) => {
        this.coAuthoredDecks.set(coAuthorDecks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        // Only show decks where user is enrolled as student (not all public decks)
        this.publicDecks.set(participantDecks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

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

  private applyFolderAndFavoritesFilter(decks: FlashcardDeck[]): FlashcardDeck[] {
    const userRefs = this.userDeckRefs();
    let list = decks;

    // Folder filter
    const folderId = this.selectedFolderId();
    if (folderId) {
      list = list.filter(deck => {
        const ref = userRefs.find(r => r.deckId === deck.id);
        return ref?.folderId === folderId;
      });
    }

    // Favorites filter
    if (this.showFavoritesOnly()) {
      list = list.filter(deck => {
        const ref = userRefs.find(r => r.deckId === deck.id);
        return ref?.isFavorite;
      });
    }

    // Tags filter
    const tags = this.selectedTags();
    if (tags.length > 0) {
      list = list.filter(deck => {
        const ref = userRefs.find(r => r.deckId === deck.id);
        return tags.every(tag => ref?.tags?.includes(tag));
      });
    }

    return list;
  }

  getDeckUserRef(deckId: string): UserDeckReference | undefined {
    return this.userDeckRefs().find(r => r.deckId === deckId);
  }

  getFolderForDeck(deckId: string): Folder | undefined {
    const ref = this.getDeckUserRef(deckId);
    if (!ref?.folderId) return undefined;
    return this.folders().find(f => f.id === ref.folderId);
  }

  // Folder/Favorites event handlers
  onFolderSelect(folderId: string | null): void {
    this.selectedFolderId.set(folderId);
  }

  onFavoritesToggle(showFavorites: boolean): void {
    this.showFavoritesOnly.set(showFavorites);
    if (showFavorites) {
      this.selectedFolderId.set(null);
    }
  }

  async onToggleFavorite(deckId: string, isFavorite: boolean): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    // Optimistic update
    this.userDeckRefs.update(refs =>
      refs.map(ref =>
        ref.deckId === deckId ? { ...ref, isFavorite } : ref
      )
    );

    try {
      await this.participantService.setFavorite(userId, deckId, isFavorite);
    } catch (err) {
      console.error('Error toggling favorite:', err);
      // Rollback
      this.userDeckRefs.update(refs =>
        refs.map(ref =>
          ref.deckId === deckId ? { ...ref, isFavorite: !isFavorite } : ref
        )
      );
      this.toastService.error('Favorit konnte nicht geändert werden');
    }
  }

  openCreateFolderDialog(): void {
    this.folderDialogData.set({ mode: 'create', contentType: 'deck' });
    this.folderDialogOpen.set(true);
  }

  openEditFolderDialog(folder: Folder): void {
    this.folderDialogData.set({ mode: 'edit', folder, contentType: 'deck' });
    this.folderDialogOpen.set(true);
  }

  closeFolderDialog(): void {
    this.folderDialogOpen.set(false);
    this.folderDialogData.set(null);
  }

  async onFolderSave(result: FolderDialogResult): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    const data = this.folderDialogData();
    if (!data) return;

    try {
      if (data.mode === 'create') {
        const newFolderId = await this.folderService.createFolder(
          userId,
          result.name,
          'deck',
          result.color,
          result.icon
        );
        await this.loadFolders();
        this.toastService.success('Ordner erstellt');
      } else if (data.mode === 'edit' && data.folder) {
        await this.folderService.updateFolder(userId, data.folder.id, {
          name: result.name,
          color: result.color,
          icon: result.icon
        });
        await this.loadFolders();
        this.toastService.success('Ordner aktualisiert');
      }
      this.closeFolderDialog();
    } catch (err) {
      console.error('Error saving folder:', err);
      this.toastService.error('Ordner konnte nicht gespeichert werden');
    }
  }

  async onFolderDelete(): Promise<void> {
    const userId = this.currentUser()?.uid;
    const data = this.folderDialogData();
    if (!userId || !data || data.mode !== 'edit' || !data.folder) return;

    try {
      await this.folderService.deleteFolder(userId, data.folder.id);
      if (this.selectedFolderId() === data.folder.id) {
        this.selectedFolderId.set(null);
      }
      await this.loadFolders();
      this.closeFolderDialog();
      this.toastService.success('Ordner gelöscht');
    } catch (err) {
      console.error('Error deleting folder:', err);
      this.toastService.error('Ordner konnte nicht gelöscht werden');
    }
  }

  private async loadFolders(): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    try {
      const folders = await this.folderService.getFoldersAsync(userId, 'deck');
      this.folders.set(folders);
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  }

  private loadTags(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    this.tagService.getAllUserTags(userId, 'deck').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (tags) => this.availableTags.set(tags),
      error: (err) => console.error('Error loading tags:', err)
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
    const previousPublicDecks = this.publicDecks();
    const optimisticRef: UserDeckReference = {
      deckId: deck.id,
      role: 'student',
      addedAt: new Date(),
      lastAccessedAt: new Date(),
      tags: [],
      isFavorite: false
    };

    this.userDeckRefs.update(refs => [...refs, optimisticRef]);
    this.publicDecks.update(decks => {
      if (decks.some(d => d.id === deck.id)) return decks;
      return [...decks, deck].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    });
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
      this.publicDecks.set(previousPublicDecks);
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
    const previousPublicDecks = this.publicDecks();

    this.userDeckRefs.update(refs => refs.filter(ref => ref.deckId !== deck.id));
    this.publicDecks.update(decks => decks.filter(d => d.id !== deck.id));
    this.updateEnrollmentState(deck.id, 'removing');

    try {
      await this.participantService.removeParticipant(deck.id, user.uid);

      this.updateEnrollmentState(deck.id, 'idle');
      this.toastService.success(`"${deck.title}" entfernt`);
    } catch (err) {
      console.error('Error removing deck enrollment:', err);
      this.userDeckRefs.set(previousRefs);
      this.publicDecks.set(previousPublicDecks);
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
        lastAccessedAt: new Date(),
        tags: [],
        isFavorite: false
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
