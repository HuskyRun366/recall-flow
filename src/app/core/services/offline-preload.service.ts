import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, collection, query, where, getDocs, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NetworkStatusService } from './network-status.service';

export interface PreloadStatus {
  id: string;
  title: string;
  isPreloaded: boolean;
  lastPreloaded?: Date;
  itemCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflinePreloadService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private authService = inject(AuthService);
  private networkStatus = inject(NetworkStatusService);

  private readonly STORAGE_KEYS = {
    quizzes: 'preloaded-quizzes',
    decks: 'preloaded-decks',
    materials: 'preloaded-materials'
  } as const;

  // Track preload status for all content types
  preloadedQuizzes = signal<Map<string, PreloadStatus>>(new Map());
  preloadedDecks = signal<Map<string, PreloadStatus>>(new Map());
  preloadedMaterials = signal<Map<string, PreloadStatus>>(new Map());
  isPreloading = signal(false);
  preloadProgress = signal<{ current: number; total: number } | null>(null);

  /**
   * Preload all user's quizzes, decks, and materials into Firestore cache
   */
  async preloadAllQuizzes(): Promise<void> {
    await this.preloadAllContent();
  }

  async preloadAllContent(): Promise<void> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      console.warn('Cannot preload: User not authenticated');
      return;
    }

    if (!this.networkStatus.isOnline()) {
      console.warn('Cannot preload: Device is offline');
      return;
    }

    this.isPreloading.set(true);
    console.log('Starting offline preload...');

    try {
      // Get all quiz IDs the user has access to
      const quizIds = new Set<string>();
      const deckIds = new Set<string>();
      const materialIds = new Set<string>();

      // 1. Get quizzes from userQuizzes subcollection (shared/participated quizzes)
      const userQuizzesRef = collection(this.firestore, `users/${currentUser.uid}/userQuizzes`);
      const userQuizzesSnapshot = await runInInjectionContext(this.injector, () => getDocs(userQuizzesRef));
      userQuizzesSnapshot.docs.forEach(doc => quizIds.add(doc.id));

      // 2. Get owned quizzes (where ownerId === currentUser.uid)
      const ownedQuizzesRef = collection(this.firestore, 'quizzes');
      const ownedQuery = query(ownedQuizzesRef, where('ownerId', '==', currentUser.uid));
      const ownedQuizzesSnapshot = await runInInjectionContext(this.injector, () => getDocs(ownedQuery));
      ownedQuizzesSnapshot.docs.forEach(doc => quizIds.add(doc.id));

      // 3. Get decks from userDecks subcollection
      const userDecksRef = collection(this.firestore, `users/${currentUser.uid}/userDecks`);
      const userDecksSnapshot = await runInInjectionContext(this.injector, () => getDocs(userDecksRef));
      userDecksSnapshot.docs.forEach(doc => deckIds.add(doc.id));

      // 4. Get owned decks
      const ownedDecksRef = collection(this.firestore, 'flashcardDecks');
      const ownedDecksQuery = query(ownedDecksRef, where('ownerId', '==', currentUser.uid));
      const ownedDecksSnapshot = await runInInjectionContext(this.injector, () => getDocs(ownedDecksQuery));
      ownedDecksSnapshot.docs.forEach(doc => deckIds.add(doc.id));

      // 5. Get materials from userMaterials subcollection
      const userMaterialsRef = collection(this.firestore, `users/${currentUser.uid}/userMaterials`);
      const userMaterialsSnapshot = await runInInjectionContext(this.injector, () => getDocs(userMaterialsRef));
      userMaterialsSnapshot.docs.forEach(doc => materialIds.add(doc.id));

      // 6. Get owned materials
      const ownedMaterialsRef = collection(this.firestore, 'learningMaterials');
      const ownedMaterialsQuery = query(ownedMaterialsRef, where('ownerId', '==', currentUser.uid));
      const ownedMaterialsSnapshot = await runInInjectionContext(this.injector, () => getDocs(ownedMaterialsQuery));
      ownedMaterialsSnapshot.docs.forEach(doc => materialIds.add(doc.id));

      const allQuizIds = Array.from(quizIds);
      const allDeckIds = Array.from(deckIds);
      const allMaterialIds = Array.from(materialIds);
      const totalItems = allQuizIds.length + allDeckIds.length + allMaterialIds.length;
      let currentIndex = 0;

      this.preloadProgress.set({ current: 0, total: totalItems });

      const preloadedQuizMap = new Map<string, PreloadStatus>();
      const preloadedDeckMap = new Map<string, PreloadStatus>();
      const preloadedMaterialMap = new Map<string, PreloadStatus>();

      console.log(
        `Found ${allQuizIds.length} quizzes, ${allDeckIds.length} decks, ${allMaterialIds.length} materials to preload.`
      );

      // Preload each quiz and its questions
      for (const quizId of allQuizIds) {
        currentIndex++;

        try {
          // Fetch quiz document (this will cache it)
          const quizRef = doc(this.firestore, `quizzes/${quizId}`);
          const quizSnapshot = await runInInjectionContext(this.injector, () => getDoc(quizRef));

          if (!quizSnapshot.exists()) {
            console.warn(`Quiz ${quizId} not found`);
            preloadedQuizMap.set(quizId, {
              id: quizId,
              title: 'Unknown Quiz',
              isPreloaded: false,
              itemCount: 0
            });
          } else {
            const quizData = quizSnapshot.data();

            // Fetch all questions for this quiz (this will cache them)
            const questionsRef = collection(this.firestore, 'questions');
            const questionsQuery = query(questionsRef, where('quizId', '==', quizId));
            const questionsSnapshot = await runInInjectionContext(this.injector, () => getDocs(questionsQuery));

            // Mark as preloaded
            preloadedQuizMap.set(quizId, {
              id: quizId,
              title: quizData['title'] || 'Untitled Quiz',
              isPreloaded: true,
              lastPreloaded: new Date(),
              itemCount: questionsSnapshot.size
            });

            console.log(`Preloaded: ${quizData['title']} (${questionsSnapshot.size} questions)`);
          }

        } catch (error) {
          console.error(`Error preloading quiz ${quizId}:`, error);
          preloadedQuizMap.set(quizId, {
            id: quizId,
            title: 'Unknown Quiz',
            isPreloaded: false,
            itemCount: 0
          });
        }

        this.preloadProgress.set({ current: currentIndex, total: totalItems });
      }

      // Preload each deck and its flashcards
      for (const deckId of allDeckIds) {
        currentIndex++;

        try {
          const deckRef = doc(this.firestore, `flashcardDecks/${deckId}`);
          const deckSnapshot = await runInInjectionContext(this.injector, () => getDoc(deckRef));

          if (!deckSnapshot.exists()) {
            console.warn(`Deck ${deckId} not found`);
            preloadedDeckMap.set(deckId, {
              id: deckId,
              title: 'Unknown Deck',
              isPreloaded: false,
              itemCount: 0
            });
          } else {
            const deckData = deckSnapshot.data();

            const flashcardsRef = collection(this.firestore, 'flashcards');
            const flashcardsQuery = query(flashcardsRef, where('deckId', '==', deckId));
            const flashcardsSnapshot = await runInInjectionContext(this.injector, () => getDocs(flashcardsQuery));

            preloadedDeckMap.set(deckId, {
              id: deckId,
              title: deckData['title'] || 'Untitled Deck',
              isPreloaded: true,
              lastPreloaded: new Date(),
              itemCount: flashcardsSnapshot.size
            });

            console.log(`Preloaded: ${deckData['title']} (${flashcardsSnapshot.size} cards)`);
          }
        } catch (error) {
          console.error(`Error preloading deck ${deckId}:`, error);
          preloadedDeckMap.set(deckId, {
            id: deckId,
            title: 'Unknown Deck',
            isPreloaded: false,
            itemCount: 0
          });
        }

        this.preloadProgress.set({ current: currentIndex, total: totalItems });
      }

      // Preload each learning material
      for (const materialId of allMaterialIds) {
        currentIndex++;

        try {
          const materialRef = doc(this.firestore, `learningMaterials/${materialId}`);
          const materialSnapshot = await runInInjectionContext(this.injector, () => getDoc(materialRef));

          if (!materialSnapshot.exists()) {
            console.warn(`Material ${materialId} not found`);
            preloadedMaterialMap.set(materialId, {
              id: materialId,
              title: 'Unknown Material',
              isPreloaded: false,
              itemCount: 0
            });
          } else {
            const materialData = materialSnapshot.data();

            preloadedMaterialMap.set(materialId, {
              id: materialId,
              title: materialData['title'] || 'Untitled Material',
              isPreloaded: true,
              lastPreloaded: new Date(),
              itemCount: materialData['contentSize'] || 0
            });

            console.log(`Preloaded: ${materialData['title']}`);
          }
        } catch (error) {
          console.error(`Error preloading material ${materialId}:`, error);
          preloadedMaterialMap.set(materialId, {
            id: materialId,
            title: 'Unknown Material',
            isPreloaded: false,
            itemCount: 0
          });
        }

        this.preloadProgress.set({ current: currentIndex, total: totalItems });
      }

      // Update signals
      this.preloadedQuizzes.set(preloadedQuizMap);
      this.preloadedDecks.set(preloadedDeckMap);
      this.preloadedMaterials.set(preloadedMaterialMap);

      // Save to localStorage for persistence
      this.savePreloadStatusToStorage(this.STORAGE_KEYS.quizzes, preloadedQuizMap);
      this.savePreloadStatusToStorage(this.STORAGE_KEYS.decks, preloadedDeckMap);
      this.savePreloadStatusToStorage(this.STORAGE_KEYS.materials, preloadedMaterialMap);

      console.log(
        `Preload complete: ${preloadedQuizMap.size} quizzes, ${preloadedDeckMap.size} decks, ${preloadedMaterialMap.size} materials cached`
      );

    } catch (error) {
      console.error('Error during preload:', error);
    } finally {
      this.isPreloading.set(false);
      this.preloadProgress.set(null);
    }
  }

  /**
   * Check if a specific quiz is preloaded
   */
  isQuizPreloaded(quizId: string): boolean {
    return this.preloadedQuizzes().get(quizId)?.isPreloaded || false;
  }

  /**
   * Check if a specific deck is preloaded
   */
  isDeckPreloaded(deckId: string): boolean {
    return this.preloadedDecks().get(deckId)?.isPreloaded || false;
  }

  /**
   * Check if a specific material is preloaded
   */
  isMaterialPreloaded(materialId: string): boolean {
    return this.preloadedMaterials().get(materialId)?.isPreloaded || false;
  }

  /**
   * Get preload status for a specific quiz
   */
  getQuizPreloadStatus(quizId: string): PreloadStatus | undefined {
    return this.preloadedQuizzes().get(quizId);
  }

  /**
   * Load preload status from localStorage
   */
  private loadPreloadStatusFromStorage(key: string): Map<string, PreloadStatus> {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return new Map();

      const parsed = JSON.parse(stored);
      const map = new Map<string, PreloadStatus>();

      for (const [mapKey, value] of Object.entries(parsed)) {
        const raw = value as any;
        const id = raw?.id || raw?.quizId || raw?.deckId || raw?.materialId || mapKey;
        if (!id) continue;

        const status: PreloadStatus = {
          id,
          title: raw?.title || 'Unknown',
          isPreloaded: !!raw?.isPreloaded,
          itemCount: typeof raw?.itemCount === 'number'
            ? raw.itemCount
            : (raw?.questionCount ?? raw?.cardCount ?? raw?.contentSize ?? 0),
          ...(raw?.lastPreloaded ? { lastPreloaded: new Date(raw.lastPreloaded) } : {})
        };

        map.set(id, status);
      }

      return map;
    } catch (error) {
      console.error('Error loading preload status:', error);
      return new Map();
    }
  }

  /**
   * Save preload status to localStorage
   */
  private savePreloadStatusToStorage(key: string, map: Map<string, PreloadStatus>): void {
    try {
      const obj: Record<string, PreloadStatus> = {};
      map.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem(key, JSON.stringify(obj));
    } catch (error) {
      console.error('Error saving preload status:', error);
    }
  }

  /**
   * Initialize the service - load stored preload status
   */
  init(): void {
    this.preloadedQuizzes.set(this.loadPreloadStatusFromStorage(this.STORAGE_KEYS.quizzes));
    this.preloadedDecks.set(this.loadPreloadStatusFromStorage(this.STORAGE_KEYS.decks));
    this.preloadedMaterials.set(this.loadPreloadStatusFromStorage(this.STORAGE_KEYS.materials));
  }
}
