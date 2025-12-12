import { Injectable, inject, signal, effect, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, collection, query, where, getDocs, doc, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { NetworkStatusService } from './network-status.service';

export interface PreloadStatus {
  quizId: string;
  title: string;
  isPreloaded: boolean;
  lastPreloaded?: Date;
  questionCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflinePreloadService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private authService = inject(AuthService);
  private networkStatus = inject(NetworkStatusService);

  // Track preload status for all quizzes
  preloadedQuizzes = signal<Map<string, PreloadStatus>>(new Map());
  isPreloading = signal(false);
  preloadProgress = signal<{ current: number; total: number } | null>(null);

  constructor() {
    // Auto-preload when coming back online
    effect(() => {
      const isOnline = this.networkStatus.isOnline();
      if (isOnline && this.authService.isAuthenticated()) {
        this.autoPreloadQuizzes();
      }
    });
  }

  /**
   * Preload all user's quizzes and their questions into Firestore cache
   */
  async preloadAllQuizzes(): Promise<void> {
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
    console.log('Starting quiz preload...');

    try {
      // Get all quiz IDs the user has access to
      const quizIds = new Set<string>();

      // 1. Get quizzes from userQuizzes subcollection (shared/participated quizzes)
      const userQuizzesRef = collection(this.firestore, `users/${currentUser.uid}/userQuizzes`);
      const userQuizzesSnapshot = await runInInjectionContext(this.injector, () => getDocs(userQuizzesRef));
      userQuizzesSnapshot.docs.forEach(doc => quizIds.add(doc.id));

      // 2. Get owned quizzes (where ownerId === currentUser.uid)
      const ownedQuizzesRef = collection(this.firestore, 'quizzes');
      const ownedQuery = query(ownedQuizzesRef, where('ownerId', '==', currentUser.uid));
      const ownedQuizzesSnapshot = await runInInjectionContext(this.injector, () => getDocs(ownedQuery));
      ownedQuizzesSnapshot.docs.forEach(doc => quizIds.add(doc.id));

      const allQuizIds = Array.from(quizIds);
      const totalQuizzes = allQuizIds.length;
      let currentIndex = 0;

      this.preloadProgress.set({ current: 0, total: totalQuizzes });

      const preloadedMap = new Map<string, PreloadStatus>();

      console.log(`Found ${totalQuizzes} quizzes to preload (${userQuizzesSnapshot.size} shared, ${ownedQuizzesSnapshot.size} owned)`);

      // Preload each quiz and its questions
      for (const quizId of allQuizIds) {
        currentIndex++;

        try {
          // Fetch quiz document (this will cache it)
          const quizRef = doc(this.firestore, `quizzes/${quizId}`);
          const quizSnapshot = await runInInjectionContext(this.injector, () => getDoc(quizRef));

          if (!quizSnapshot.exists()) {
            console.warn(`Quiz ${quizId} not found`);
            continue;
          }

          const quizData = quizSnapshot.data();

          // Fetch all questions for this quiz (this will cache them)
          const questionsRef = collection(this.firestore, 'questions');
          const questionsQuery = query(questionsRef, where('quizId', '==', quizId));
          const questionsSnapshot = await runInInjectionContext(this.injector, () => getDocs(questionsQuery));

          // Mark as preloaded
          preloadedMap.set(quizId, {
            quizId,
            title: quizData['title'] || 'Untitled Quiz',
            isPreloaded: true,
            lastPreloaded: new Date(),
            questionCount: questionsSnapshot.size
          });

          console.log(`Preloaded: ${quizData['title']} (${questionsSnapshot.size} questions)`);

        } catch (error) {
          console.error(`Error preloading quiz ${quizId}:`, error);
          preloadedMap.set(quizId, {
            quizId,
            title: 'Unknown Quiz',
            isPreloaded: false,
            questionCount: 0
          });
        }

        this.preloadProgress.set({ current: currentIndex, total: totalQuizzes });
      }

      // Update signal
      this.preloadedQuizzes.set(preloadedMap);

      // Save to localStorage for persistence
      this.savePreloadStatusToStorage(preloadedMap);

      console.log(`Preload complete: ${preloadedMap.size} quizzes cached`);

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
   * Get preload status for a specific quiz
   */
  getQuizPreloadStatus(quizId: string): PreloadStatus | undefined {
    return this.preloadedQuizzes().get(quizId);
  }

  /**
   * Auto-preload quizzes when coming online (with debounce)
   */
  private autoPreloadQuizzes(): void {
    // Wait a bit to let the app stabilize
    setTimeout(() => {
      // Only auto-preload if we haven't preloaded recently
      const lastPreload = localStorage.getItem('last-preload-time');
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      if (!lastPreload || parseInt(lastPreload) < oneHourAgo) {
        console.log('Auto-preloading quizzes...');
        this.preloadAllQuizzes();
        localStorage.setItem('last-preload-time', Date.now().toString());
      }
    }, 3000);
  }

  /**
   * Load preload status from localStorage
   */
  private loadPreloadStatusFromStorage(): void {
    try {
      const stored = localStorage.getItem('preloaded-quizzes');
      if (stored) {
        const parsed = JSON.parse(stored);
        const map = new Map<string, PreloadStatus>();

        for (const [key, value] of Object.entries(parsed)) {
          const status = value as PreloadStatus;
          // Convert date string back to Date object
          if (status.lastPreloaded) {
            status.lastPreloaded = new Date(status.lastPreloaded);
          }
          map.set(key, status);
        }

        this.preloadedQuizzes.set(map);
      }
    } catch (error) {
      console.error('Error loading preload status:', error);
    }
  }

  /**
   * Save preload status to localStorage
   */
  private savePreloadStatusToStorage(map: Map<string, PreloadStatus>): void {
    try {
      const obj: Record<string, PreloadStatus> = {};
      map.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem('preloaded-quizzes', JSON.stringify(obj));
    } catch (error) {
      console.error('Error saving preload status:', error);
    }
  }

  /**
   * Initialize the service - load stored preload status
   */
  init(): void {
    this.loadPreloadStatusFromStorage();
  }
}
