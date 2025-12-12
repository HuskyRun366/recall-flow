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
  Timestamp,
  QueryConstraint
} from '@angular/fire/firestore';
import { Quiz } from '../../models';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private readonly QUIZ_COLLECTION = 'quizzes';
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  constructor() {}

  // Create a new quiz
  createQuiz(quiz: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt'>): Observable<string> {
    const quizRef = doc(collection(this.firestore, this.QUIZ_COLLECTION));
    const quizId = quizRef.id;

    const quizData = {
      ...quiz,
      id: quizId,
      questionCount: quiz.questionCount || 0,
      metadata: quiz.metadata || {
        totalParticipants: 0,
        totalCompletions: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    return from(setDoc(quizRef, quizData)).pipe(
      map(() => quizId)
    );
  }

  // Update an existing quiz
  updateQuiz(quizId: string, updates: Partial<Quiz>): Observable<void> {
    const quizRef = doc(this.firestore, `${this.QUIZ_COLLECTION}/${quizId}`);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    delete (updateData as any).id;
    delete (updateData as any).createdAt;

    return from(updateDoc(quizRef, updateData));
  }

  // Delete a quiz (legacy - only deletes quiz document)
  deleteQuiz(quizId: string): Observable<void> {
    const quizRef = doc(this.firestore, `${this.QUIZ_COLLECTION}/${quizId}`);
    return from(deleteDoc(quizRef));
  }

  /**
   * Delete a quiz with complete cleanup of all related data.
   * This method should be used instead of deleteQuiz() to prevent orphaned data.
   *
   * Cleans up:
   * - Questions in the questions collection
   * - Progress data in quizProgress/{quizId}
   * - Participants in quizParticipants/{quizId}
   * - User quiz references in users/{userId}/userQuizzes/{quizId}
   */
  async deleteQuizWithCleanup(
    quizId: string,
    questionService: { deleteQuestionsByQuizId: (quizId: string) => Promise<void> },
    progressService: { deleteQuizProgress: (quizId: string) => Promise<void> },
    participantService: { deleteAllParticipants: (quizId: string) => Promise<void> }
  ): Promise<void> {
    // Delete all related data in parallel for better performance
    await Promise.all([
      questionService.deleteQuestionsByQuizId(quizId),
      progressService.deleteQuizProgress(quizId),
      participantService.deleteAllParticipants(quizId)
    ]);

    // Finally, delete the quiz document itself
    const quizRef = doc(this.firestore, `${this.QUIZ_COLLECTION}/${quizId}`);
    await deleteDoc(quizRef);
  }

  // Get a single quiz by ID
  getQuizById(quizId: string): Observable<Quiz | null> {
    const quizRef = doc(this.firestore, `${this.QUIZ_COLLECTION}/${quizId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(quizRef))
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
   * Get multiple quizzes by their IDs using individual document reads.
   * Uses getDoc() for each quiz instead of a query to avoid permission issues.
   * This works better with Firestore security rules that check participant access.
   */
  getQuizzesByIds(quizIds: string[]): Observable<Quiz[]> {
    if (quizIds.length === 0) {
      return from(Promise.resolve([]));
    }

    const TIMEOUT_MS = 5000;  // 5 seconds timeout per quiz

    // Fetch each quiz individually instead of using a query
    // This avoids the "all or nothing" permission issue with queries
    const quizPromises = quizIds.map(async (quizId) => {
      try {
        const quizDoc = doc(this.firestore, `${this.QUIZ_COLLECTION}/${quizId}`);

        // Promise with timeout
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading quiz ${quizId}`)), TIMEOUT_MS)
        );

        const docSnap = await Promise.race([
          getDoc(quizDoc),
          timeoutPromise
        ]);

        if (docSnap.exists()) {
          return this.convertTimestamps(docSnap.data() as any);
        } else {
          console.warn(`Quiz ${quizId} not found`);
          return null;
        }
      } catch (error: any) {
        console.error(`Failed to fetch quiz ${quizId}:`, error.message);
        return null; // Return null instead of throwing, so other quizzes can still be fetched
      }
    });

    return from(Promise.allSettled(quizPromises)).pipe(
      map(results =>
        results
          .filter((result): result is PromiseFulfilledResult<Quiz | null> =>
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value as Quiz)
      )
    );
  }

  // Get all quizzes accessible by a user (owned + co-authored + public)
  getQuizzesForUser(userId: string): Observable<Quiz[]> {
    const quizzesRef = collection(this.firestore, this.QUIZ_COLLECTION);

    // We'll need to make multiple queries because Firestore doesn't support
    // OR queries directly in a single query
    const ownedQuery = query(
      quizzesRef,
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

  // Get public quizzes
  getPublicQuizzes(): Observable<Quiz[]> {
    const quizzesRef = collection(this.firestore, this.QUIZ_COLLECTION);
    const publicQuery = query(
      quizzesRef,
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

  // Get quiz by join code
  getQuizByJoinCode(joinCode: string): Observable<Quiz | null> {
    const quizzesRef = collection(this.firestore, this.QUIZ_COLLECTION);
    const joinCodeQuery = query(
      quizzesRef,
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
        // Return the first matching quiz
        return this.convertTimestamps(snapshot.docs[0].data() as any);
      })
    );
  }

  // Update quiz metadata (participant count, completion count)
  updateQuizMetadata(quizId: string, metadata: Partial<{ totalParticipants: number; totalCompletions: number }>): Observable<void> {
    return this.getQuizById(quizId).pipe(
      map(quiz => {
        if (!quiz) throw new Error('Quiz not found');

        const updatedMetadata = {
          ...quiz.metadata,
          ...metadata
        };

        return this.updateQuiz(quizId, { metadata: updatedMetadata });
      }),
      map(() => undefined)
    );
  }

  // Update question count
  updateQuestionCount(quizId: string, count: number): Observable<void> {
    return this.updateQuiz(quizId, { questionCount: count });
  }

  // Helper to convert Firestore timestamps to Date objects
  private convertTimestamps(data: any): Quiz {
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
