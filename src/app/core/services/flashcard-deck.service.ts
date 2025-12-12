import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { FlashcardDeck } from '../../models';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class FlashcardDeckService {
  private readonly DECK_COLLECTION = 'flashcardDecks';
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  constructor() {}

  // Create a new deck
  createDeck(deck: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>): Observable<string> {
    const deckRef = doc(collection(this.firestore, this.DECK_COLLECTION));
    const deckId = deckRef.id;

    const deckData = {
      ...deck,
      id: deckId,
      cardCount: deck.cardCount || 0,
      tags: deck.tags || [],
      metadata: deck.metadata || {
        totalStudents: 0,
        totalCompletions: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    return from(setDoc(deckRef, deckData)).pipe(
      map(() => deckId)
    );
  }

  // Update an existing deck
  updateDeck(deckId: string, updates: Partial<FlashcardDeck>): Observable<void> {
    const deckRef = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    delete (updateData as any).id;
    delete (updateData as any).createdAt;

    return from(updateDoc(deckRef, updateData));
  }

  // Delete a deck (should be used with cleanup - see deleteWithCleanup)
  deleteDeck(deckId: string): Observable<void> {
    const deckRef = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);
    return from(deleteDoc(deckRef));
  }

  /**
   * Delete a deck with complete cleanup of all related data.
   *
   * Cleans up:
   * - Flashcards in the flashcards collection
   * - Progress data in flashcardProgress/{deckId}
   * - Participants in deckParticipants/{deckId}
   * - User deck references in users/{userId}/userDecks/{deckId}
   */
  async deleteDeckWithCleanup(
    deckId: string,
    flashcardService: { deleteFlashcardsByDeckId: (deckId: string) => Promise<void> },
    progressService: { deleteDeckProgress: (deckId: string) => Promise<void> },
    participantService: { deleteAllParticipants: (deckId: string) => Promise<void> }
  ): Promise<void> {
    // Delete all related data in parallel for better performance
    await Promise.all([
      flashcardService.deleteFlashcardsByDeckId(deckId),
      progressService.deleteDeckProgress(deckId),
      participantService.deleteAllParticipants(deckId)
    ]);

    // Finally, delete the deck document itself
    const deckRef = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);
    await deleteDoc(deckRef);
  }

  // Get a single deck by ID
  getDeckById(deckId: string): Observable<FlashcardDeck | null> {
    const deckRef = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(deckRef))
    ).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          return this.convertTimestamps(docSnap.data() as any);
        }
        return null;
      })
    );
  }

  /**
   * Get multiple decks by their IDs using individual document reads.
   * Uses getDoc() for each deck instead of a query to avoid permission issues.
   */
  getDecksByIds(deckIds: string[]): Observable<FlashcardDeck[]> {
    if (deckIds.length === 0) {
      return from(Promise.resolve([]));
    }

    const TIMEOUT_MS = 5000;  // 5 seconds timeout per deck

    const deckPromises = deckIds.map(async (deckId) => {
      try {
        const deckDoc = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);

        // Promise with timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading deck ${deckId}`)), TIMEOUT_MS)
        );

        const docSnap = await Promise.race([
          getDoc(deckDoc),
          timeoutPromise
        ]);

        if (docSnap.exists()) {
          return this.convertTimestamps(docSnap.data() as any);
        } else {
          console.warn(`Deck ${deckId} not found`);
          return null;
        }
      } catch (error: any) {
        console.error(`Failed to fetch deck ${deckId}:`, error.message);
        return null;
      }
    });

    return from(Promise.allSettled(deckPromises)).pipe(
      map(results =>
        results
          .filter((result): result is PromiseFulfilledResult<FlashcardDeck | null> =>
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value as FlashcardDeck)
      )
    );
  }

  // Get all decks accessible by a user (owned + co-authored + public)
  getDecksForUser(userId: string): Observable<FlashcardDeck[]> {
    const decksRef = collection(this.firestore, this.DECK_COLLECTION);

    const ownedQuery = query(
      decksRef,
      where('ownerId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(ownedQuery))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc =>
          this.convertTimestamps(doc.data() as any)
        );
      })
    );
  }

  // Get public decks
  getPublicDecks(): Observable<FlashcardDeck[]> {
    const decksRef = collection(this.firestore, this.DECK_COLLECTION);
    const publicQuery = query(
      decksRef,
      where('visibility', '==', 'public'),
      orderBy('updatedAt', 'desc')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(publicQuery))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc =>
          this.convertTimestamps(doc.data() as any)
        );
      })
    );
  }

  // Get deck by join code
  getDeckByJoinCode(joinCode: string): Observable<FlashcardDeck | null> {
    const decksRef = collection(this.firestore, this.DECK_COLLECTION);
    const joinCodeQuery = query(
      decksRef,
      where('visibility', '==', 'unlisted'),
      where('joinCode', '==', joinCode.trim().toUpperCase())
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(joinCodeQuery))
    ).pipe(
      map(snapshot => {
        if (snapshot.empty) {
          return null;
        }
        return this.convertTimestamps(snapshot.docs[0].data() as any);
      })
    );
  }

  // Search decks by title or description
  searchDecks(searchTerm: string): Observable<FlashcardDeck[]> {
    const decksRef = collection(this.firestore, this.DECK_COLLECTION);
    const publicQuery = query(
      decksRef,
      where('visibility', '==', 'public')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(publicQuery))
    ).pipe(
      map(snapshot => {
        const searchLower = searchTerm.toLowerCase();
        return snapshot.docs
          .map(doc => this.convertTimestamps(doc.data() as any))
          .filter(deck =>
            deck.title.toLowerCase().includes(searchLower) ||
            deck.description.toLowerCase().includes(searchLower) ||
            deck.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
      })
    );
  }

  // Update deck metadata (student count, completion count)
  updateDeckMetadata(deckId: string, metadata: Partial<{ totalStudents: number; totalCompletions: number }>): Observable<void> {
    return this.getDeckById(deckId).pipe(
      map(deck => {
        if (!deck) throw new Error('Deck not found');

        const updatedMetadata = {
          ...deck.metadata,
          ...metadata
        };

        return this.updateDeck(deckId, { metadata: updatedMetadata });
      }),
      map(() => undefined)
    );
  }

  // Update card count (denormalized field)
  async updateCardCount(deckId: string, delta: number): Promise<void> {
    const deckRef = doc(this.firestore, `${this.DECK_COLLECTION}/${deckId}`);
    const deckSnap = await getDoc(deckRef);

    if (deckSnap.exists()) {
      const currentCount = deckSnap.data()['cardCount'] || 0;
      const newCount = Math.max(0, currentCount + delta);

      await updateDoc(deckRef, {
        cardCount: newCount,
        updatedAt: serverTimestamp()
      });
    }
  }

  // Generate join code for unlisted decks
  generateJoinCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = (len: number) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return `${part(4)}-${part(4)}`;
  }

  // Helper to convert Firestore timestamps to Date objects
  private convertTimestamps(data: any): FlashcardDeck {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt
    };
  }
}
