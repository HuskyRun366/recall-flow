import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  CollectionReference,
  DocumentReference
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { Flashcard } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class FlashcardService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private flashcardsCollection = collection(this.firestore, 'flashcards') as CollectionReference<Flashcard>;

  /**
   * Create a new flashcard
   */
  async createFlashcard(card: Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const cardDoc = doc(this.flashcardsCollection);
    const cardId = cardDoc.id;

    const cardData = {
      ...this.stripUndefined(card),
      id: cardId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await setDoc(cardDoc, cardData);
    return cardId;
  }

  /**
   * Create multiple flashcards in a batch
   */
  async createFlashcards(cards: Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const batch = writeBatch(this.firestore);
    const cardIds: string[] = [];

    cards.forEach((card) => {
      const cardDoc = doc(this.flashcardsCollection);
      const cardId = cardDoc.id;
      cardIds.push(cardId);

      const cardData = {
        ...this.stripUndefined(card),
        id: cardId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      batch.set(cardDoc, cardData);
    });

    await batch.commit();
    return cardIds;
  }

  /**
   * Get a single flashcard by ID
   */
  getFlashcardById(cardId: string): Observable<Flashcard | null> {
    const cardDoc = doc(this.firestore, `flashcards/${cardId}`) as DocumentReference<Flashcard>;
    return from(
      runInInjectionContext(this.injector, () => getDoc(cardDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data();
        return this.convertTimestamps(data);
      })
    );
  }

  /**
   * Get all flashcards for a deck, ordered by orderIndex
   */
  getFlashcardsByDeckId(deckId: string): Observable<Flashcard[]> {
    const q = query(
      this.flashcardsCollection,
      where('deckId', '==', deckId),
      orderBy('orderIndex', 'asc')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertTimestamps(data);
        });
      })
    );
  }

  /**
   * Update a flashcard
   */
  async updateFlashcard(cardId: string, updates: Partial<Flashcard>): Promise<void> {
    const cardDoc = doc(this.firestore, `flashcards/${cardId}`);
    const updateData = this.stripUndefined(updates);

    await updateDoc(cardDoc, {
      ...updateData,
      updatedAt: Timestamp.now()
    });
  }

  /**
   * Delete a flashcard
   */
  async deleteFlashcard(cardId: string): Promise<void> {
    const cardDoc = doc(this.firestore, `flashcards/${cardId}`);
    await deleteDoc(cardDoc);
  }

  /**
   * Delete all flashcards for a deck
   */
  async deleteFlashcardsByDeckId(deckId: string): Promise<void> {
    const q = query(
      this.flashcardsCollection,
      where('deckId', '==', deckId)
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(q));
    const batch = writeBatch(this.firestore);

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  /**
   * Reorder flashcards for a deck
   */
  async reorderFlashcards(deckId: string, cardIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);

    cardIds.forEach((cardId, index) => {
      const cardDoc = doc(this.firestore, `flashcards/${cardId}`);
      batch.update(cardDoc, {
        orderIndex: index,
        updatedAt: Timestamp.now()
      });
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates
   */
  private convertTimestamps(data: any): Flashcard {
    return {
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    };
  }

  /**
   * Recursively remove `undefined` values so Firestore writes don't fail.
   * Firestore rejects `undefined` fields (e.g. optional frontImageUrl, backImageUrl).
   */
  private stripUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map(v => this.stripUndefined(v)) as unknown as T;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, any>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, this.stripUndefined(v)]);
      return Object.fromEntries(entries) as T;
    }
    return value;
  }
}
