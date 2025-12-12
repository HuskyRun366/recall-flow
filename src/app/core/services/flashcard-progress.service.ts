import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  CollectionReference,
  writeBatch
} from '@angular/fire/firestore';
import {
  UserDeckProgress,
  CardProgress,
  ProgressLevel,
  DeckProgressSummary
} from '../../models';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class FlashcardProgressService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Get user's progress for a deck
   * Path: flashcardProgress/{deckId}/userProgress/{userId}
   */
  getUserDeckProgress(deckId: string, userId: string): Observable<UserDeckProgress | null> {
    const progressDoc = doc(this.firestore, `flashcardProgress/${deckId}/userProgress/${userId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(progressDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data();
        return this.convertUserDeckTimestamps(data);
      })
    );
  }

  /**
   * Get all card progress for a user in a deck
   * Path: flashcardProgress/{deckId}/userProgress/{userId}/cardProgress/
   */
  getCardProgress(deckId: string, userId: string): Observable<CardProgress[]> {
    const cardProgressCol = collection(
      this.firestore,
      `flashcardProgress/${deckId}/userProgress/${userId}/cardProgress`
    ) as CollectionReference<CardProgress>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(cardProgressCol))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertCardTimestamps(data);
        });
      })
    );
  }

  /**
   * Get single card progress
   */
  getSingleCardProgress(deckId: string, userId: string, cardId: string): Observable<CardProgress | null> {
    const cardProgressDoc = doc(
      this.firestore,
      `flashcardProgress/${deckId}/userProgress/${userId}/cardProgress/${cardId}`
    );

    return from(
      runInInjectionContext(this.injector, () => getDoc(cardProgressDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data();
        return this.convertCardTimestamps(data);
      })
    );
  }

  /**
   * Initialize progress for a deck
   */
  async initializeProgress(deckId: string, userId: string, cardIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Create user deck progress document
    const userDeckProgressDoc = doc(this.firestore, `flashcardProgress/${deckId}/userProgress/${userId}`);
    const userDeckProgressData: any = {
      userId,
      deckId,
      lastStudyAt: Timestamp.now(),
      completionRate: 0
    };
    batch.set(userDeckProgressDoc, userDeckProgressData);

    // Create card progress documents
    cardIds.forEach(cardId => {
      const cardProgressDoc = doc(
        this.firestore,
        `flashcardProgress/${deckId}/userProgress/${userId}/cardProgress/${cardId}`
      );
      const cardProgressData: any = {
        cardId,
        level: 0,
        lastAttemptAt: Timestamp.now(),
        correctCount: 0,
        incorrectCount: 0
      };
      batch.set(cardProgressDoc, cardProgressData);
    });

    await batch.commit();
  }

  /**
   * Update progress after studying a card
   */
  async updateCardProgress(
    deckId: string,
    userId: string,
    cardId: string,
    isCorrect: boolean
  ): Promise<void> {
    // Get current progress
    const cardProgressDoc = doc(
      this.firestore,
      `flashcardProgress/${deckId}/userProgress/${userId}/cardProgress/${cardId}`
    );

    const docSnap = await runInInjectionContext(this.injector, () => getDoc(cardProgressDoc));

    if (!docSnap.exists()) {
      // Initialize if doesn't exist
      const cardProgressData: any = {
        cardId,
        level: isCorrect ? 1 : 0,
        lastAttemptAt: Timestamp.now(),
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1
      };
      await setDoc(cardProgressDoc, cardProgressData);
    } else {
      const currentProgress = docSnap.data() as any;

      let newLevel: ProgressLevel;
      if (isCorrect) {
        // Increase level, max 3
        newLevel = Math.min((currentProgress.level || 0) + 1, 3) as ProgressLevel;
      } else {
        // Reset to level 0 on incorrect answer
        newLevel = 0;
      }

      await updateDoc(cardProgressDoc, {
        level: newLevel,
        lastAttemptAt: Timestamp.now(),
        correctCount: (currentProgress.correctCount || 0) + (isCorrect ? 1 : 0),
        incorrectCount: (currentProgress.incorrectCount || 0) + (isCorrect ? 0 : 1)
      });
    }

    // Update user deck progress timestamp
    const userDeckProgressDoc = doc(this.firestore, `flashcardProgress/${deckId}/userProgress/${userId}`);
    await setDoc(
      userDeckProgressDoc,
      {
        userId,
        deckId,
        lastStudyAt: Timestamp.now()
      },
      { merge: true }
    );
  }

  /**
   * Update completion rate for a deck
   */
  async updateCompletionRate(deckId: string, userId: string, completionRate: number): Promise<void> {
    const userDeckProgressDoc = doc(this.firestore, `flashcardProgress/${deckId}/userProgress/${userId}`);
    await setDoc(
      userDeckProgressDoc,
      {
        userId,
        deckId,
        completionRate
      },
      { merge: true }
    );
  }

  /**
   * Get progress summary for a deck
   */
  getProgressSummary(deckId: string, userId: string): Observable<DeckProgressSummary> {
    return this.getCardProgress(deckId, userId).pipe(
      map(cardProgressList => {
        const summary: DeckProgressSummary = {
          totalCards: cardProgressList.length,
          level0Count: 0,
          level1Count: 0,
          level2Count: 0,
          level3Count: 0,
          completionRate: 0,
          lastStudyAt: undefined
        };

        cardProgressList.forEach(cp => {
          switch (cp.level) {
            case 0:
              summary.level0Count++;
              break;
            case 1:
              summary.level1Count++;
              break;
            case 2:
              summary.level2Count++;
              break;
            case 3:
              summary.level3Count++;
              break;
          }
        });

        // Calculate completion rate
        if (summary.totalCards > 0) {
          summary.completionRate = Math.round((summary.level3Count / summary.totalCards) * 100);
        }

        // Get last study date
        if (cardProgressList.length > 0) {
          const latestDate = cardProgressList.reduce((latest, cp) => {
            return cp.lastAttemptAt > latest ? cp.lastAttemptAt : latest;
          }, cardProgressList[0].lastAttemptAt);
          summary.lastStudyAt = latestDate;
        }

        return summary;
      })
    );
  }

  /**
   * Get all students' progress for a deck (for analytics/leaderboards)
   */
  getAllUsersProgressForDeck(deckId: string): Observable<UserDeckProgress[]> {
    const userProgressCol = collection(
      this.firestore,
      `flashcardProgress/${deckId}/userProgress`
    ) as CollectionReference<UserDeckProgress>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(userProgressCol))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertUserDeckTimestamps(data);
        });
      })
    );
  }

  /**
   * Delete all progress for a deck (when deck is deleted)
   */
  async deleteDeckProgress(deckId: string): Promise<void> {
    const userProgressCol = collection(this.firestore, `flashcardProgress/${deckId}/userProgress`);
    const snapshot = await runInInjectionContext(this.injector, () => getDocs(userProgressCol));

    const batch = writeBatch(this.firestore);

    // Delete all user progress documents and their subcollections
    for (const userDoc of snapshot.docs) {
      // Delete card progress subcollection
      const cardProgressCol = collection(
        this.firestore,
        `flashcardProgress/${deckId}/userProgress/${userDoc.id}/cardProgress`
      );
      const cardSnapshot = await runInInjectionContext(this.injector, () => getDocs(cardProgressCol));
      cardSnapshot.docs.forEach(cardDoc => {
        batch.delete(cardDoc.ref);
      });

      // Delete user progress document
      batch.delete(userDoc.ref);
    }

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for UserDeckProgress
   */
  private convertUserDeckTimestamps(data: any): UserDeckProgress {
    return {
      ...data,
      lastStudyAt: data.lastStudyAt?.toDate() || new Date()
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for CardProgress
   */
  private convertCardTimestamps(data: any): CardProgress {
    return {
      ...data,
      lastAttemptAt: data.lastAttemptAt?.toDate() || new Date()
    };
  }
}
