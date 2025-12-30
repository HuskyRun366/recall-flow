import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface TrendingQuiz {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  ownerDisplayName: string;
  category: string;
  difficulty: string;
  questionCount: number;
  trendingScore: number;
  totalCompletions: number;
  totalParticipants: number;
  rank: number;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecommendedQuiz {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  ownerDisplayName: string;
  category: string;
  difficulty: string;
  questionCount: number;
  score: number;
  reason: 'followed-author' | 'category-match' | 'difficulty-match' | 'popular';
  rank: number;
  generatedAt: Date;
}

export interface TrendingStats {
  lastCalculated: Date;
  totalQuizzesAnalyzed: number;
  trendingCount: number;
}

export interface StorageStats {
  storageUsed: number;
  storageLimit: number;
  storagePercent: number;
}

@Injectable({
  providedIn: 'root'
})
export class DiscoveryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  // Signals for reactive state
  trending = signal<TrendingQuiz[]>([]);
  recommendations = signal<RecommendedQuiz[]>([]);
  isLoadingTrending = signal(false);
  isLoadingRecommendations = signal(false);
  trendingStats = signal<TrendingStats | null>(null);

  // Computed values
  topTrending = computed(() => this.trending().slice(0, 10));
  topRecommendations = computed(() => this.recommendations().slice(0, 10));

  /**
   * Load trending quizzes from pre-calculated collection
   */
  loadTrending(limitCount: number = 20): Observable<TrendingQuiz[]> {
    this.isLoadingTrending.set(true);

    const trendingRef = collection(this.firestore, 'trending');
    const q = query(
      trendingRef,
      orderBy('rank', 'asc'),
      limit(limitCount)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const quizzes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data['title'] || 'Untitled',
            description: data['description'] || '',
            ownerId: data['ownerId'],
            ownerDisplayName: data['ownerDisplayName'] || 'Unknown',
            category: data['category'] || 'general',
            difficulty: data['difficulty'] || 'medium',
            questionCount: data['questionCount'] || 0,
            trendingScore: data['trendingScore'] || 0,
            totalCompletions: data['totalCompletions'] || 0,
            totalParticipants: data['totalParticipants'] || 0,
            rank: data['rank'] || 0,
            calculatedAt: data['calculatedAt'] instanceof Timestamp
              ? data['calculatedAt'].toDate()
              : new Date(),
            createdAt: data['createdAt'] instanceof Timestamp
              ? data['createdAt'].toDate()
              : new Date(),
            updatedAt: data['updatedAt'] instanceof Timestamp
              ? data['updatedAt'].toDate()
              : new Date()
          } as TrendingQuiz;
        });

        this.trending.set(quizzes);
        return quizzes;
      }),
      tap(() => this.isLoadingTrending.set(false)),
      catchError(error => {
        console.error('Error loading trending:', error);
        this.isLoadingTrending.set(false);
        return of([]);
      })
    );
  }

  /**
   * Load personalized recommendations for current user
   */
  loadRecommendations(limitCount: number = 20): Observable<RecommendedQuiz[]> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return of([]);
    }

    this.isLoadingRecommendations.set(true);

    const recsRef = collection(this.firestore, `users/${currentUser.uid}/recommendations`);
    const q = query(
      recsRef,
      orderBy('rank', 'asc'),
      limit(limitCount)
    );

    return from(getDocs(q)).pipe(
      map(snapshot => {
        const quizzes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data['title'] || 'Untitled',
            description: data['description'] || '',
            ownerId: data['ownerId'],
            ownerDisplayName: data['ownerDisplayName'] || 'Unknown',
            category: data['category'] || 'general',
            difficulty: data['difficulty'] || 'medium',
            questionCount: data['questionCount'] || 0,
            score: data['score'] || 0,
            reason: data['reason'] || 'popular',
            rank: data['rank'] || 0,
            generatedAt: data['generatedAt'] instanceof Timestamp
              ? data['generatedAt'].toDate()
              : new Date()
          } as RecommendedQuiz;
        });

        this.recommendations.set(quizzes);
        return quizzes;
      }),
      tap(() => this.isLoadingRecommendations.set(false)),
      catchError(error => {
        console.error('Error loading recommendations:', error);
        this.isLoadingRecommendations.set(false);
        return of([]);
      })
    );
  }

  /**
   * Get trending stats
   */
  loadTrendingStats(): Observable<TrendingStats | null> {
    const statsRef = doc(this.firestore, 'system/trendingStats');

    return from(getDoc(statsRef)).pipe(
      map(snapshot => {
        if (!snapshot.exists()) {
          return null;
        }

        const data = snapshot.data();
        const stats: TrendingStats = {
          lastCalculated: data['lastCalculated'] instanceof Timestamp
            ? data['lastCalculated'].toDate()
            : new Date(),
          totalQuizzesAnalyzed: data['totalQuizzesAnalyzed'] || 0,
          trendingCount: data['trendingCount'] || 0
        };

        this.trendingStats.set(stats);
        return stats;
      }),
      catchError(error => {
        console.error('Error loading trending stats:', error);
        return of(null);
      })
    );
  }

  /**
   * Get user's storage usage
   */
  loadStorageStats(): Observable<StorageStats | null> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return of(null);
    }

    const userRef = doc(this.firestore, `users/${currentUser.uid}`);

    return from(getDoc(userRef)).pipe(
      map(snapshot => {
        if (!snapshot.exists()) {
          return null;
        }

        const data = snapshot.data();
        return {
          storageUsed: data['storageUsed'] || 0,
          storageLimit: data['storageLimit'] || 100 * 1024 * 1024, // 100MB default
          storagePercent: data['storagePercent'] || 0
        } as StorageStats;
      }),
      catchError(error => {
        console.error('Error loading storage stats:', error);
        return of(null);
      })
    );
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get recommendation reason text key
   */
  getReasonTextKey(reason: RecommendedQuiz['reason']): string {
    switch (reason) {
      case 'followed-author':
        return 'discovery.reasonFollowedAuthor';
      case 'category-match':
        return 'discovery.reasonCategoryMatch';
      case 'difficulty-match':
        return 'discovery.reasonDifficultyMatch';
      case 'popular':
      default:
        return 'discovery.reasonPopular';
    }
  }
}
