import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, forkJoin, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  Quiz,
  FlashcardDeck,
  LearningMaterial,
  ContentCategory,
  DifficultyLevel,
  MarketplaceTheme,
  MarketplaceItem,
  TopChartType,
  FeaturedContentConfig
} from '../../models';
import { ContentType } from '../../models/review.model';
import { ColorThemeService, StoredColorThemeV1 } from './color-theme.service';

export interface MarketplaceSearchParams {
  query?: string;
  contentTypes?: ContentType[];
  category?: ContentCategory;
  difficulty?: DifficultyLevel;
  language?: string;
  sortBy?: 'rating' | 'popular' | 'recent';
  limitCount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MarketplaceService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private colorThemes = inject(ColorThemeService);

  /**
   * Search marketplace with filters
   */
  searchMarketplace(params: MarketplaceSearchParams): Observable<MarketplaceItem[]> {
    const contentTypes = params.contentTypes || ['quiz', 'deck', 'material', 'theme'];
    const limitCount = params.limitCount || 50;

    const searches: Observable<MarketplaceItem[]>[] = [];

    if (contentTypes.includes('quiz')) {
      searches.push(this.searchQuizzes(params, limitCount));
    }
    if (contentTypes.includes('deck')) {
      searches.push(this.searchDecks(params, limitCount));
    }
    if (contentTypes.includes('material')) {
      searches.push(this.searchMaterials(params, limitCount));
    }
    if (contentTypes.includes('theme')) {
      searches.push(this.searchThemes(params, limitCount));
    }

    return forkJoin(searches).pipe(
      map(results => {
        const allItems = results.flat();
        return this.sortItems(allItems, params.sortBy || 'rating');
      })
    );
  }

  /**
   * Get trending content
   */
  getTrending(contentType?: ContentType, limitCount: number = 10): Observable<MarketplaceItem[]> {
    return this.getTopContent('popular', contentType, limitCount);
  }

  /**
   * Get most popular content (by participant/student count)
   */
  getMostPopular(contentType?: ContentType, limitCount: number = 10): Observable<MarketplaceItem[]> {
    return this.getTopContent('popular', contentType, limitCount);
  }

  /**
   * Get recently added content
   */
  getRecentlyAdded(contentType?: ContentType, limitCount: number = 10): Observable<MarketplaceItem[]> {
    return this.getTopContent('recent', contentType, limitCount);
  }

  /**
   * Get featured content (curated list)
   */
  getFeatured(): Observable<MarketplaceItem[]> {
    const configRef = doc(this.firestore, 'config/featuredContent');

    return from(
      runInInjectionContext(this.injector, () => getDoc(configRef))
    ).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return of([]);
        }

        const config = docSnap.data() as FeaturedContentConfig;
        if (!config.items || config.items.length === 0) {
          return of([]);
        }

        // Fetch each featured item
        const fetchPromises = config.items.map(item =>
          this.fetchContentById(item.id, item.type)
        );

        return from(Promise.all(fetchPromises)).pipe(
          map(items => items.filter((item): item is MarketplaceItem => item !== null))
        );
      })
    );
  }

  /**
   * Get content by category
   */
  getByCategory(category: ContentCategory, limitCount: number = 20): Observable<MarketplaceItem[]> {
    return this.searchMarketplace({
      category,
      limitCount,
      sortBy: 'popular'
    });
  }

  /**
   * Get content by difficulty
   */
  getByDifficulty(difficulty: DifficultyLevel, limitCount: number = 20): Observable<MarketplaceItem[]> {
    return this.searchMarketplace({
      difficulty,
      limitCount,
      sortBy: 'popular'
    });
  }

  // Private helper methods

  private searchQuizzes(params: MarketplaceSearchParams, limitCount: number): Observable<MarketplaceItem[]> {
    const quizzesRef = collection(this.firestore, 'quizzes');
    const constraints: any[] = [
      where('visibility', '==', 'public'),
      limit(limitCount)
    ];

    if (params.category) {
      constraints.push(where('category', '==', params.category));
    }
    if (params.difficulty) {
      constraints.push(where('difficulty', '==', params.difficulty));
    }
    if (params.language) {
      constraints.push(where('language', '==', params.language));
    }

    const q = query(quizzesRef, ...constraints);

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        let quizzes = snapshot.docs.map(doc => this.convertQuizTimestamps(doc.data() as any));

        // Client-side text filtering (Firestore doesn't support full-text search)
        if (params.query) {
          const searchLower = params.query.toLowerCase();
          quizzes = quizzes.filter(quiz =>
            quiz.title.toLowerCase().includes(searchLower) ||
            quiz.description.toLowerCase().includes(searchLower)
          );
        }

        return quizzes.map(quiz => ({
          type: 'quiz' as ContentType,
          content: quiz
        }));
      })
    );
  }

  private searchDecks(params: MarketplaceSearchParams, limitCount: number): Observable<MarketplaceItem[]> {
    const decksRef = collection(this.firestore, 'flashcardDecks');
    const constraints: any[] = [
      where('visibility', '==', 'public'),
      limit(limitCount)
    ];

    if (params.category) {
      constraints.push(where('category', '==', params.category));
    }
    if (params.difficulty) {
      constraints.push(where('difficulty', '==', params.difficulty));
    }
    if (params.language) {
      constraints.push(where('language', '==', params.language));
    }

    const q = query(decksRef, ...constraints);

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        let decks = snapshot.docs.map(doc => this.convertDeckTimestamps(doc.data() as any));

        if (params.query) {
          const searchLower = params.query.toLowerCase();
          decks = decks.filter(deck =>
            deck.title.toLowerCase().includes(searchLower) ||
            deck.description.toLowerCase().includes(searchLower) ||
            deck.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }

        return decks.map(deck => ({
          type: 'deck' as ContentType,
          content: deck
        }));
      })
    );
  }

  private searchMaterials(params: MarketplaceSearchParams, limitCount: number): Observable<MarketplaceItem[]> {
    const materialsRef = collection(this.firestore, 'learningMaterials');
    const constraints: any[] = [
      where('visibility', '==', 'public'),
      limit(limitCount)
    ];

    if (params.category) {
      constraints.push(where('category', '==', params.category));
    }
    if (params.difficulty) {
      constraints.push(where('difficulty', '==', params.difficulty));
    }
    if (params.language) {
      constraints.push(where('language', '==', params.language));
    }

    const q = query(materialsRef, ...constraints);

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        let materials = snapshot.docs.map(doc => this.convertMaterialTimestamps(doc.data() as any));

        if (params.query) {
          const searchLower = params.query.toLowerCase();
          materials = materials.filter(material =>
            material.title.toLowerCase().includes(searchLower) ||
            material.description.toLowerCase().includes(searchLower) ||
            material.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }

        return materials.map(material => ({
          type: 'material' as ContentType,
          content: material
        }));
      })
    );
  }

  private searchThemes(params: MarketplaceSearchParams, limitCount: number): Observable<MarketplaceItem[]> {
    // Themes don't currently support the same category/difficulty/language filtering.
    if (params.category || params.difficulty || params.language) {
      return of([]);
    }

    const themesRef = collection(this.firestore, 'themes');
    const constraints: any[] = [
      where('visibility', '==', 'public'),
      limit(limitCount)
    ];

    const q = query(themesRef, ...constraints);

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        let themes = snapshot.docs.map(doc => this.convertThemeTimestamps(doc.data() as any));

        if (params.query) {
          const searchLower = params.query.toLowerCase();
          themes = themes.filter(theme =>
            theme.title.toLowerCase().includes(searchLower) ||
            (theme.description && theme.description.toLowerCase().includes(searchLower))
          );
        }

        return themes.map(theme => ({
          type: 'theme' as ContentType,
          content: theme
        }));
      })
    );
  }

  private getTopContent(
    chartType: TopChartType,
    contentType?: ContentType,
    limitCount: number = 10
  ): Observable<MarketplaceItem[]> {
    const contentTypes = contentType ? [contentType] : (['quiz', 'deck', 'material', 'theme'] as ContentType[]);
    const searches: Observable<MarketplaceItem[]>[] = [];

    contentTypes.forEach(type => {
      const collectionName = this.getCollectionName(type);
      const contentRef = collection(this.firestore, collectionName);

      let orderField: string;
      switch (chartType) {
        case 'popular':
          if (type === 'theme') {
            orderField = 'metadata.totalInstalls';
          } else {
            orderField = type === 'quiz' ? 'metadata.totalParticipants' : 'metadata.totalStudents';
          }
          break;
        case 'recent':
          orderField = 'createdAt';
          break;
        case 'trending':
        default:
          if (type === 'theme') {
            orderField = 'metadata.totalInstalls';
          } else {
            orderField = type === 'quiz' ? 'metadata.totalParticipants' : 'metadata.totalStudents';
          }
      }

      const q = query(
        contentRef,
        where('visibility', '==', 'public'),
        orderBy(orderField, 'desc'),
        limit(limitCount)
      );

      const search$ = from(
        runInInjectionContext(this.injector, () => getDocs(q))
      ).pipe(
        map(snapshot => {
          return snapshot.docs.map(doc => {
            const data = doc.data() as any;
            return {
              type,
              content: this.convertTimestamps(data, type)
            } as MarketplaceItem;
          });
        })
      );

      searches.push(search$);
    });

    return forkJoin(searches).pipe(
      map(results => {
        const allItems = results.flat();
        return this.sortItems(allItems, chartType === 'recent' ? 'recent' : 'popular').slice(0, limitCount);
      })
    );
  }

  private async fetchContentById(id: string, type: ContentType): Promise<MarketplaceItem | null> {
    const collectionName = this.getCollectionName(type);
    const contentRef = doc(this.firestore, `${collectionName}/${id}`);

    const docSnap = await runInInjectionContext(this.injector, () => getDoc(contentRef));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as any;
    return {
      type,
      content: this.convertTimestamps(data, type)
    };
  }

  private sortItems(items: MarketplaceItem[], sortBy: 'rating' | 'popular' | 'recent'): MarketplaceItem[] {
    return items.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return (b.content.averageRating || 0) - (a.content.averageRating || 0);
        case 'popular':
          const aPopular = this.getPopularityScore(a);
          const bPopular = this.getPopularityScore(b);
          return bPopular - aPopular;
        case 'recent':
          return new Date(b.content.createdAt).getTime() - new Date(a.content.createdAt).getTime();
        default:
          return 0;
      }
    });
  }

  private getPopularityScore(item: MarketplaceItem): number {
    if (item.type === 'quiz') {
      return (item.content as Quiz).metadata.totalParticipants;
    } else if (item.type === 'deck') {
      return (item.content as FlashcardDeck).metadata.totalStudents;
    } else if (item.type === 'theme') {
      return (item.content as MarketplaceTheme).metadata.totalInstalls;
    } else {
      return (item.content as LearningMaterial).metadata.totalStudents;
    }
  }

  private getCollectionName(contentType: ContentType): string {
    switch (contentType) {
      case 'quiz':
        return 'quizzes';
      case 'deck':
        return 'flashcardDecks';
      case 'material':
        return 'learningMaterials';
      case 'theme':
        return 'themes';
    }
  }

  private convertTimestamps(data: any, type: ContentType): Quiz | FlashcardDeck | LearningMaterial | MarketplaceTheme {
    switch (type) {
      case 'quiz':
        return this.convertQuizTimestamps(data);
      case 'deck':
        return this.convertDeckTimestamps(data);
      case 'material':
        return this.convertMaterialTimestamps(data);
      case 'theme':
        return this.convertThemeTimestamps(data);
    }
  }

  private convertQuizTimestamps(data: any): Quiz {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  }

  private convertDeckTimestamps(data: any): FlashcardDeck {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  }

  private convertMaterialTimestamps(data: any): LearningMaterial {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  }

  private convertThemeTimestamps(data: any): MarketplaceTheme {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  }
}
