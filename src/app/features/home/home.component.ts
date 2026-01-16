import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { FirestoreService } from '../../core/services/firestore.service';
import { ProgressService } from '../../core/services/progress.service';
import { ParticipantService } from '../../core/services/participant.service';
import { AuthService } from '../../core/services/auth.service';
import { OfflinePreloadService } from '../../core/services/offline-preload.service';
import { PwaDetectionService } from '../../core/services/pwa-detection.service';
import { FolderService } from '../../core/services/folder.service';
import { TagService } from '../../core/services/tag.service';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';
import {
  StatCardComponent,
  FolderSidebarComponent,
  FolderDialogComponent,
  FavoriteButtonComponent
} from '../../shared/components';
import { Quiz, ProgressSummary, UserQuizReference, Folder } from '../../models';
import { FolderDialogData, FolderDialogResult } from '../../shared/components/folder-dialog/folder-dialog.component';
import { combineLatest, forkJoin, of, Observable, timeout, from, fromEvent } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';

interface QuizWithProgress {
  quiz: Quiz;
  progress: ProgressSummary;
  totalQuestions: number;
  userCanEdit?: boolean;
  isOfflineAvailable?: boolean;
  userRef?: UserQuizReference;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    SkeletonLoaderComponent,
    StatCardComponent,
    FolderSidebarComponent,
    FolderDialogComponent,
    FavoriteButtonComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  private firestoreService = inject(FirestoreService);
  private progressService = inject(ProgressService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private pwaDetection = inject(PwaDetectionService);
  private folderService = inject(FolderService);
  private tagService = inject(TagService);
  private destroyRef = inject(DestroyRef);

  quizzesWithProgress = signal<QuizWithProgress[]>([]);
  userQuizRefs = signal<UserQuizReference[]>([]);
  userQuizRoleMap = signal<Map<string, UserQuizReference['role']>>(new Map());
  searchTerm = signal('');
  fabOpen = signal(false);

  // Folder/Tag/Favorites state
  folders = signal<Folder[]>([]);
  selectedFolderId = signal<string | null>(null);
  showFavoritesOnly = signal(false);
  availableTags = signal<string[]>([]);
  selectedTags = signal<string[]>([]);
  sidebarCollapsed = signal(true);

  // Context menu state
  contextMenuOpen = signal(false);
  contextMenuPosition = signal({ x: 0, y: 0 });
  contextMenuQuizId = signal<string | null>(null);

  contextMenuFolderId = computed(() => {
    const quizId = this.contextMenuQuizId();
    if (!quizId) return null;
    return this.quizzesWithProgress().find(q => q.quiz.id === quizId)?.userRef?.folderId ?? null;
  });

  // Folder dialog state
  folderDialogOpen = signal(false);
  folderDialogData = signal<FolderDialogData | null>(null);

  // Computed for selected folder (for filter chip display)
  selectedFolder = computed(() => {
    const folderId = this.selectedFolderId();
    if (!folderId) return null;
    return this.folders().find(f => f.id === folderId) ?? null;
  });

  filteredQuizzes = computed(() => {
    let list = this.quizzesWithProgress();

    // Folder filter
    const folderId = this.selectedFolderId();
    if (folderId) {
      list = list.filter(q => q.userRef?.folderId === folderId);
    }

    // Favorites filter
    if (this.showFavoritesOnly()) {
      list = list.filter(q => q.userRef?.isFavorite);
    }

    // Tags filter
    const tags = this.selectedTags();
    if (tags.length > 0) {
      list = list.filter(q =>
        tags.every(tag => q.userRef?.tags?.includes(tag))
      );
    }

    // Search filter
    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      list = list.filter(item => {
        const title = (item.quiz.title || '').toLowerCase();
        const desc = (item.quiz.description || '').toLowerCase();
        return title.includes(term) || desc.includes(term);
      });
    }

    return list;
  });
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;

  // Keep isPWA for the offline availability badge
  isPWA = this.pwaDetection.isPWA;

  // Computed statistics
  totalQuizzes = computed(() => this.quizzesWithProgress().length);
  totalQuestions = computed(() =>
    this.quizzesWithProgress().reduce((sum, qwp) => sum + qwp.totalQuestions, 0)
  );

  overallProgress = computed(() => {
    const quizzes = this.quizzesWithProgress();
    if (quizzes.length === 0) return 0;

    const totalQs = quizzes.reduce((sum, qwp) => sum + qwp.totalQuestions, 0);
    if (totalQs === 0) return 0;

    const trainedQs = quizzes.reduce(
      (sum, qwp) => sum + qwp.progress.onceTrained + qwp.progress.twiceTrained * 2 + qwp.progress.perfectlyTrained * 3,
      0
    );

    return Math.round((trainedQs / (totalQs * 3)) * 100);
  });

  ngOnInit(): void {
    this.loadData();
    this.loadFolders();
    this.loadTags();

    fromEvent<MouseEvent>(document, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.closeContextMenu());

    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key === 'Escape') {
          this.closeContextMenu();
        }
      });
  }

  private loadFolders(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    this.folderService.getFolders(userId, 'quiz').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (folders) => this.folders.set(folders),
      error: (err) => console.error('Error loading folders:', err)
    });
  }

  private loadTags(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    this.tagService.getAllUserTags(userId, 'quiz').pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (tags) => this.availableTags.set(tags),
      error: (err) => console.error('Error loading tags:', err)
    });
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

    // Load quizzes using proper RxJS chain with takeUntilDestroyed
    combineLatest([
      this.participantService.getUserQuizzes(userId),
      this.firestoreService.getQuizzesForUser(userId)
    ]).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(([userQuizRefs, ownedQuizzes]) => {
        this.userQuizRefs.set(userQuizRefs);
        const roleMap = new Map<string, UserQuizReference['role']>();
        userQuizRefs.forEach(ref => roleMap.set(ref.quizId, ref.role));
        this.userQuizRoleMap.set(roleMap);

        const userQuizIds = userQuizRefs.map(ref => ref.quizId);

        // Fetch Quiz objects for user references using batch query
        // This reduces N individual reads to 1 query (or ceil(N/30) for larger lists)
        const userQuizzes$ = userQuizIds.length > 0
          ? this.firestoreService.getQuizzesByIds(userQuizIds).pipe(
              catchError(() => of([] as Quiz[]))
            )
          : of([] as Quiz[]);

        return userQuizzes$.pipe(
          map(userQuizzes => {
            return this.deduplicateQuizzes([...userQuizzes, ...ownedQuizzes]);
          })
        );
      }),
      switchMap(allQuizzes => this.loadProgressForQuizzes(allQuizzes, userId))
    ).subscribe({
      next: (quizzesWithProgress) => {
        this.quizzesWithProgress.set(quizzesWithProgress);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading quizzes:', err);
        this.error.set('Failed to load quizzes. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  private deduplicateQuizzes(quizzes: Quiz[]): Quiz[] {
    const uniqueMap = new Map<string, Quiz>();
    quizzes.forEach(quiz => {
      if (!uniqueMap.has(quiz.id)) {
        uniqueMap.set(quiz.id, quiz);
      }
    });
    return Array.from(uniqueMap.values());
  }

  private loadProgressForQuizzes(quizzes: Quiz[], userId: string) {
    if (quizzes.length === 0) {
      return of([] as QuizWithProgress[]);
    }

    const progressObservables = quizzes.map(quiz =>
      this.progressService.getProgressSummary(quiz.id, userId).pipe(
        catchError(() => of({
          notTrained: quiz.questionCount,
          onceTrained: 0,
          twiceTrained: 0,
          perfectlyTrained: 0
        }))
      )
    );

    return forkJoin(progressObservables).pipe(
      timeout(10000),  // 10 seconds timeout for all progress queries
      catchError(error => {
        console.error('Error loading progress:', error);
        // Fallback: Return quizzes without progress
        return of(quizzes.map(quiz => ({
          notTrained: quiz.questionCount,
          onceTrained: 0,
          twiceTrained: 0,
          perfectlyTrained: 0
        })));
      }),
      switchMap(progressSummaries => {
        const userRefs = this.userQuizRefs();
        const quizzesWithProgress: QuizWithProgress[] = quizzes.map((quiz, index) => {
          const raw = progressSummaries[index] || {
            notTrained: quiz.questionCount,
            onceTrained: 0,
            twiceTrained: 0,
            perfectlyTrained: 0
          };

          const capped = this.capSummaryToQuestionCount(raw, quiz.questionCount);
          const normalized = this.normalizeSummary(capped, quiz.questionCount);
          const completed = this.fillMissingWithNotTrained(normalized, quiz.questionCount);
          const userRef = userRefs.find(ref => ref.quizId === quiz.id);

          return {
            quiz,
            progress: completed,
            totalQuestions: quiz.questionCount,
            userCanEdit: false,  // Will be set by checkEditPermissions
            userRef
          };
        });

        return this.checkEditPermissions(quizzesWithProgress, userId);
      }),
      map(quizzesWithProgress => {
        // Sort by update date
        quizzesWithProgress.sort((a, b) =>
          b.quiz.updatedAt.getTime() - a.quiz.updatedAt.getTime()
        );
        return quizzesWithProgress;
      }),
      catchError(error => {
        console.error('Error in quiz loading chain:', error);
        // Return quizzes with default progress on error
        const quizzesWithProgress: QuizWithProgress[] = quizzes.map(quiz => ({
          quiz,
          progress: {
            notTrained: quiz.questionCount,
            onceTrained: 0,
            twiceTrained: 0,
            perfectlyTrained: 0
          },
          totalQuestions: quiz.questionCount,
          userCanEdit: false
        }));
        return of(quizzesWithProgress);
      })
    );
  }

  /**
   * Cap progress summary to the quiz's current question count to avoid stale progress entries
   * (e.g., deleted questions that still exist in progress collection).
   */
  private capSummaryToQuestionCount(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total <= questionCount) return summary;

    let excess = total - questionCount;
    const capped: ProgressSummary = { ...summary };

    // Remove from lowest-impact buckets first
    const reduceBucket = (key: keyof ProgressSummary) => {
      const remove = Math.min(excess, capped[key]);
      capped[key] -= remove;
      excess -= remove;
    };

    reduceBucket('notTrained');
    if (excess > 0) reduceBucket('onceTrained');
    if (excess > 0) reduceBucket('twiceTrained');
    if (excess > 0) reduceBucket('perfectlyTrained');

    return capped;
  }

  private normalizeSummary(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total === 0) {
      return {
        notTrained: questionCount,
        onceTrained: 0,
        twiceTrained: 0,
        perfectlyTrained: 0
      };
    }
    return summary;
  }

  // If progress totals are less than questionCount, put the remainder into notTrained
  private fillMissingWithNotTrained(summary: ProgressSummary, questionCount: number): ProgressSummary {
    const total = summary.notTrained + summary.onceTrained + summary.twiceTrained + summary.perfectlyTrained;
    if (total >= questionCount) return summary;

    const missing = questionCount - total;
    return {
      ...summary,
      notTrained: summary.notTrained + missing
    };
  }

  getProgressPercentage(progress: ProgressSummary, level: number): number {
    const total = progress.notTrained + progress.onceTrained +
                  progress.twiceTrained + progress.perfectlyTrained;

    // Falls noch kein Fortschritt gespeichert ist, alles als "nicht gelernt" anzeigen
    if (total === 0) return level === 0 ? 100 : 0;

    let count = 0;
    switch (level) {
      case 0: count = progress.notTrained; break;
      case 1: count = progress.onceTrained; break;
      case 2: count = progress.twiceTrained; break;
      case 3: count = progress.perfectlyTrained; break;
    }

    return Math.round((count / total) * 100);
  }

  private checkEditPermissions(quizzes: QuizWithProgress[], userId: string): Observable<QuizWithProgress[]> {
    if (quizzes.length === 0) {
      return of(quizzes);
    }

    const permissionChecks = quizzes.map(quiz => {
      // Owner always has edit permission
      if (quiz.quiz.ownerId === userId) {
        return of({
          ...quiz,
          userCanEdit: true,
          isOfflineAvailable: this.offlinePreloadService.isQuizPreloaded(quiz.quiz.id)
        });
      }

      // Check via participantService with timeout
      return from(this.participantService.canEdit(quiz.quiz.id, userId)).pipe(
        timeout(5000),  // 5 seconds timeout
        catchError(() => of(false)),  // On error/timeout: no edit permission
        map(canEdit => ({
          ...quiz,
          userCanEdit: canEdit,
          isOfflineAvailable: this.offlinePreloadService.isQuizPreloaded(quiz.quiz.id)
        }))
      );
    });

    return forkJoin(permissionChecks);
  }

  canEdit(quiz: Quiz): boolean {
    const userId = this.currentUser()?.uid;
    if (!userId) return false;

    // Check if user is owner
    if (userId === quiz.ownerId) return true;

    // Check pre-computed permission from loaded data
    const qwp = this.quizzesWithProgress().find(item => item.quiz.id === quiz.id);
    return qwp?.userCanEdit ?? false;
  }

  retry(): void {
    this.loadData();
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  toggleFab(): void {
    this.fabOpen.update(open => !open);
  }

  // Folder/Favorites methods
  onFolderSelect(folderId: string | null): void {
    this.selectedFolderId.set(folderId);
    this.showFavoritesOnly.set(false);
  }

  onFavoritesToggle(showFavorites: boolean): void {
    this.showFavoritesOnly.set(showFavorites);
    if (showFavorites) {
      this.selectedFolderId.set(null);
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(collapsed => !collapsed);
  }

  async onToggleFavorite(quizId: string, isFavorite: boolean): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    const target = this.quizzesWithProgress().find(q => q.quiz.id === quizId);
    if (!target) return;

    const previousFavorite = target.userRef?.isFavorite;
    const hadUserRef = !!target.userRef;
    const now = new Date();
    const role = target.userRef?.role ?? (target.quiz.ownerId === userId ? 'owner' : 'participant');
    const nextUserRef: UserQuizReference = {
      quizId,
      role,
      addedAt: target.userRef?.addedAt ?? now,
      lastAccessedAt: target.userRef?.lastAccessedAt ?? now,
      folderId: target.userRef?.folderId,
      tags: target.userRef?.tags ?? [],
      isFavorite
    };

    // Optimistic update (ensure userRef exists for owned quizzes too)
    this.quizzesWithProgress.update(quizzes =>
      quizzes.map(q => q.quiz.id === quizId ? { ...q, userRef: nextUserRef } : q)
    );

    this.userQuizRefs.update(refs => {
      const index = refs.findIndex(ref => ref.quizId === quizId);
      if (index >= 0) {
        const updated = [...refs];
        updated[index] = { ...refs[index], isFavorite };
        return updated;
      }
      return [...refs, nextUserRef];
    });

    const addedRole = !hadUserRef;
    if (addedRole) {
      this.userQuizRoleMap.update(roleMap => {
        const next = new Map(roleMap);
        next.set(quizId, role);
        return next;
      });
    }

    try {
      await this.participantService.setFavorite(userId, quizId, isFavorite);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      // Rollback
      if (hadUserRef && typeof previousFavorite === 'boolean') {
        this.quizzesWithProgress.update(quizzes =>
          quizzes.map(q =>
            q.quiz.id === quizId ? { ...q, userRef: { ...nextUserRef, isFavorite: previousFavorite } } : q
          )
        );
        this.userQuizRefs.update(refs =>
          refs.map(ref => ref.quizId === quizId ? { ...ref, isFavorite: previousFavorite } : ref)
        );
      } else {
        this.quizzesWithProgress.update(quizzes =>
          quizzes.map(q => q.quiz.id === quizId ? { ...q, userRef: undefined } : q)
        );
        this.userQuizRefs.update(refs => refs.filter(ref => ref.quizId !== quizId));
        if (addedRole) {
          this.userQuizRoleMap.update(roleMap => {
            const next = new Map(roleMap);
            next.delete(quizId);
            return next;
          });
        }
      }
    }
  }

  async onFolderChange(quizId: string, folderId: string | null): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    const previousFolderId = this.quizzesWithProgress()
      .find(q => q.quiz.id === quizId)?.userRef?.folderId ?? null;

    // Optimistic UI update
    this.quizzesWithProgress.update(quizzes =>
      quizzes.map(q => {
        if (q.quiz.id === quizId && q.userRef) {
          return { ...q, userRef: { ...q.userRef, folderId: folderId ?? undefined } };
        }
        return q;
      })
    );

    try {
      await this.participantService.setFolder(userId, quizId, folderId);
    } catch (error) {
      console.error('Error changing folder:', error);
      // Rollback
      this.quizzesWithProgress.update(quizzes =>
        quizzes.map(q => {
          if (q.quiz.id === quizId && q.userRef) {
            return { ...q, userRef: { ...q.userRef, folderId: previousFolderId ?? undefined } };
          }
          return q;
        })
      );
    }
  }

  openFolderContextMenu(event: MouseEvent, quizId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const position = this.getContextMenuPosition(event.clientX, event.clientY);
    this.contextMenuPosition.set(position);
    this.contextMenuQuizId.set(quizId);
    this.contextMenuOpen.set(true);
  }

  openFolderContextMenuFromButton(event: MouseEvent, quizId: string): void {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const x = rect ? rect.left : event.clientX;
    const y = rect ? rect.bottom + 8 : event.clientY;

    const position = this.getContextMenuPosition(x, y);
    this.contextMenuPosition.set(position);
    this.contextMenuQuizId.set(quizId);
    this.contextMenuOpen.set(true);
  }

  closeContextMenu(): void {
    this.contextMenuOpen.set(false);
  }

  async assignFolderFromContext(folderId: string | null): Promise<void> {
    const quizId = this.contextMenuQuizId();
    if (!quizId) return;

    this.closeContextMenu();
    await this.onFolderChange(quizId, folderId);
  }

  // Folder dialog methods
  openCreateFolderDialog(): void {
    this.folderDialogData.set({
      mode: 'create',
      contentType: 'quiz'
    });
    this.folderDialogOpen.set(true);
  }

  openEditFolderDialog(folder: Folder): void {
    this.folderDialogData.set({
      mode: 'edit',
      contentType: 'quiz',
      folder
    });
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
        await this.folderService.createFolder(
          userId,
          result.name,
          'quiz',
          result.color,
          result.icon
        );
      } else if (data.mode === 'edit' && data.folder) {
        await this.folderService.updateFolder(userId, data.folder.id, {
          name: result.name,
          color: result.color,
          icon: result.icon
        });
      }
      this.closeFolderDialog();
      this.loadFolders(); // Refresh folders after save
    } catch (error) {
      console.error('Error saving folder:', error);
    }
  }

  async onFolderDelete(): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) return;

    const data = this.folderDialogData();
    if (!data?.folder) return;

    try {
      await this.folderService.deleteFolder(userId, data.folder.id);
      // Clear selection if the deleted folder was selected
      if (this.selectedFolderId() === data.folder.id) {
        this.selectedFolderId.set(null);
      }
      this.closeFolderDialog();
      this.loadFolders(); // Refresh folders after delete
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  }

  getFolderForQuiz(quizId: string): Folder | undefined {
    const quiz = this.quizzesWithProgress().find(q => q.quiz.id === quizId);
    if (!quiz?.userRef?.folderId) return undefined;
    return this.folders().find(f => f.id === quiz.userRef?.folderId);
  }

  private getContextMenuPosition(x: number, y: number): { x: number; y: number } {
    if (typeof window === 'undefined') {
      return { x, y };
    }

    const menuWidth = 240;
    const menuHeight = this.estimateContextMenuHeight();
    const margin = 8;
    const maxX = window.innerWidth - menuWidth - margin;
    const maxY = window.innerHeight - menuHeight - margin;

    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
      y: Math.min(Math.max(margin, y), Math.max(margin, maxY))
    };
  }

  private estimateContextMenuHeight(): number {
    const itemHeight = 36;
    const baseItems = 2; // title + "no folder"
    const totalItems = baseItems + this.folders().length;
    return Math.min(360, totalItems * itemHeight + 24);
  }
}
