import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs
} from '@angular/fire/firestore';
import { Observable, from, map, forkJoin, of } from 'rxjs';
import { FolderContentType } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class TagService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Get all unique tags used by a user for a specific content type.
   * This collects tags from userQuizzes, userDecks, or userMaterials.
   */
  getAllUserTags(userId: string, contentType: FolderContentType): Observable<string[]> {
    const collectionPath = this.getCollectionPath(contentType);
    const userContentCol = collection(this.firestore, `users/${userId}/${collectionPath}`);

    return from(
      runInInjectionContext(this.injector, () => getDocs(userContentCol))
    ).pipe(
      map(snapshot => {
        const allTags = new Set<string>();
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const tags = data['tags'] as string[] | undefined;
          if (tags && Array.isArray(tags)) {
            tags.forEach(tag => allTags.add(tag));
          }
        });
        return Array.from(allTags).sort();
      })
    );
  }

  /**
   * Get all unique tags across all content types for a user
   */
  getAllTags(userId: string): Observable<string[]> {
    return forkJoin([
      this.getAllUserTags(userId, 'quiz'),
      this.getAllUserTags(userId, 'deck'),
      this.getAllUserTags(userId, 'material')
    ]).pipe(
      map(([quizTags, deckTags, materialTags]) => {
        const allTags = new Set<string>([...quizTags, ...deckTags, ...materialTags]);
        return Array.from(allTags).sort();
      })
    );
  }

  /**
   * Get tag suggestions based on a prefix (for autocomplete)
   */
  getTagSuggestions(
    userId: string,
    prefix: string,
    contentType?: FolderContentType
  ): Observable<string[]> {
    const lowerPrefix = prefix.toLowerCase().trim();

    if (!lowerPrefix) {
      return contentType
        ? this.getAllUserTags(userId, contentType)
        : this.getAllTags(userId);
    }

    const tagsObservable = contentType
      ? this.getAllUserTags(userId, contentType)
      : this.getAllTags(userId);

    return tagsObservable.pipe(
      map(tags => tags.filter(tag => tag.toLowerCase().startsWith(lowerPrefix)))
    );
  }

  /**
   * Get the Firestore subcollection path for a content type
   */
  private getCollectionPath(contentType: FolderContentType): string {
    switch (contentType) {
      case 'quiz':
        return 'userQuizzes';
      case 'deck':
        return 'userDecks';
      case 'material':
        return 'userMaterials';
    }
  }
}
