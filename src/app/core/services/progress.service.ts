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
  UserQuizProgress,
  QuestionProgress,
  ProgressLevel,
  ProgressSummary
} from '../../models';
import { AdaptiveLearningService } from './adaptive-learning.service';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ProgressService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private adaptiveLearning = inject(AdaptiveLearningService);

  /**
   * Get user's progress for a quiz
   * Path: quizProgress/{quizId}/userProgress/{userId}
   */
  getUserQuizProgress(quizId: string, userId: string): Observable<UserQuizProgress | null> {
    const progressDoc = doc(this.firestore, `quizProgress/${quizId}/userProgress/${userId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(progressDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data();
        return this.convertUserQuizTimestamps(data);
      })
    );
  }

  /**
   * Get all question progress for a user in a quiz
   * Path: quizProgress/{quizId}/userProgress/{userId}/questionProgress/
   */
  getQuestionProgress(quizId: string, userId: string): Observable<QuestionProgress[]> {
    const questionProgressCol = collection(
      this.firestore,
      `quizProgress/${quizId}/userProgress/${userId}/questionProgress`
    ) as CollectionReference<QuestionProgress>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(questionProgressCol))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertQuestionTimestamps(data);
        });
      })
    );
  }

  /**
   * Get single question progress
   */
  getSingleQuestionProgress(quizId: string, userId: string, questionId: string): Observable<QuestionProgress | null> {
    const questionProgressDoc = doc(
      this.firestore,
      `quizProgress/${quizId}/userProgress/${userId}/questionProgress/${questionId}`
    );

    return from(
      runInInjectionContext(this.injector, () => getDoc(questionProgressDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data();
        return this.convertQuestionTimestamps(data);
      })
    );
  }

  /**
   * Initialize progress for a quiz
   */
  async initializeProgress(quizId: string, userId: string, questionIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    const now = Timestamp.now();

    // Create user quiz progress document
    const userQuizProgressDoc = doc(this.firestore, `quizProgress/${quizId}/userProgress/${userId}`);
    const userQuizProgressData: any = {
      userId,
      quizId,
      lastAttemptAt: now,
      completionRate: 0
    };
    batch.set(userQuizProgressDoc, userQuizProgressData);

    // Create question progress documents
    questionIds.forEach(questionId => {
      const questionProgressDoc = doc(
        this.firestore,
        `quizProgress/${quizId}/userProgress/${userId}/questionProgress/${questionId}`
      );
      const questionProgressData: any = {
        questionId,
        level: 0,
        lastAttemptAt: now,
        correctCount: 0,
        incorrectCount: 0,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        nextReviewAt: now,
        lastQuality: 0,
        lastResponseMs: null,
        difficulty: 0.5
      };
      batch.set(questionProgressDoc, questionProgressData);
    });

    await batch.commit();
  }

  /**
   * Update progress after answering a question
   */
  async updateQuestionProgress(
    quizId: string,
    userId: string,
    questionId: string,
    isCorrect: boolean,
    responseTimeMs?: number
  ): Promise<QuestionProgress> {
    // Get current progress
    const questionProgressDoc = doc(
      this.firestore,
      `quizProgress/${quizId}/userProgress/${userId}/questionProgress/${questionId}`
    );

    const docSnap = await runInInjectionContext(this.injector, () => getDoc(questionProgressDoc));
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);
    const defaultProgress: QuestionProgress = {
      questionId,
      level: 0,
      lastAttemptAt: now,
      correctCount: 0,
      incorrectCount: 0,
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      nextReviewAt: now,
      lastQuality: 0,
      lastResponseMs: undefined,
      difficulty: 0.5
    };

    if (!docSnap.exists()) {
      // Initialize if doesn't exist
      const adaptiveUpdate = this.adaptiveLearning.calculateSm2Update(defaultProgress, isCorrect, responseTimeMs, now);
      const newProgress: QuestionProgress = {
        ...defaultProgress,
        level: isCorrect ? 1 : 0,
        lastAttemptAt: now,
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1,
        easeFactor: adaptiveUpdate.easeFactor,
        intervalDays: adaptiveUpdate.intervalDays,
        repetitions: adaptiveUpdate.repetitions,
        nextReviewAt: adaptiveUpdate.nextReviewAt,
        lastQuality: adaptiveUpdate.lastQuality,
        lastResponseMs: adaptiveUpdate.lastResponseMs,
        difficulty: adaptiveUpdate.difficulty
      };

      await setDoc(questionProgressDoc, this.toFirestoreQuestionProgress(newProgress, nowTimestamp));

      this.adaptiveLearning.recordAttempt({
        userId,
        progress: defaultProgress,
        isCorrect,
        responseTimeMs,
        attemptedAt: now
      });

      await this.updateUserQuizProgressTimestamp(quizId, userId, nowTimestamp);
      return newProgress;
    } else {
      const currentProgress = this.convertQuestionTimestamps(docSnap.data());

      let newLevel: ProgressLevel;
      if (isCorrect) {
        // Increase level, max 3
        newLevel = Math.min((currentProgress.level || 0) + 1, 3) as ProgressLevel;
      } else {
        // Reset to level 0 on incorrect answer
        newLevel = 0;
      }

      const adaptiveUpdate = this.adaptiveLearning.calculateSm2Update(currentProgress, isCorrect, responseTimeMs, now);
      const nextProgress: QuestionProgress = {
        ...currentProgress,
        level: newLevel,
        lastAttemptAt: now,
        correctCount: (currentProgress.correctCount || 0) + (isCorrect ? 1 : 0),
        incorrectCount: (currentProgress.incorrectCount || 0) + (isCorrect ? 0 : 1),
        easeFactor: adaptiveUpdate.easeFactor,
        intervalDays: adaptiveUpdate.intervalDays,
        repetitions: adaptiveUpdate.repetitions,
        nextReviewAt: adaptiveUpdate.nextReviewAt,
        lastQuality: adaptiveUpdate.lastQuality,
        lastResponseMs: adaptiveUpdate.lastResponseMs,
        difficulty: adaptiveUpdate.difficulty
      };

      await updateDoc(questionProgressDoc, this.toFirestoreQuestionProgress(nextProgress, nowTimestamp));

      this.adaptiveLearning.recordAttempt({
        userId,
        progress: currentProgress,
        isCorrect,
        responseTimeMs,
        attemptedAt: now
      });

      await this.updateUserQuizProgressTimestamp(quizId, userId, nowTimestamp);
      return nextProgress;
    }
  }

  /**
   * Update completion rate for a quiz
   */
  async updateCompletionRate(quizId: string, userId: string, completionRate: number): Promise<void> {
    const userQuizProgressDoc = doc(this.firestore, `quizProgress/${quizId}/userProgress/${userId}`);
    await setDoc(
      userQuizProgressDoc,
      {
        userId,
        quizId,
        completionRate
      },
      { merge: true }
    );
  }

  /**
   * Get progress summary for a quiz
   */
  getProgressSummary(quizId: string, userId: string): Observable<ProgressSummary> {
    return this.getQuestionProgress(quizId, userId).pipe(
      map(questionProgressList => {
        const summary: ProgressSummary = {
          notTrained: 0,
          onceTrained: 0,
          twiceTrained: 0,
          perfectlyTrained: 0
        };

        questionProgressList.forEach(qp => {
          switch (qp.level) {
            case 0:
              summary.notTrained++;
              break;
            case 1:
              summary.onceTrained++;
              break;
            case 2:
              summary.twiceTrained++;
              break;
            case 3:
              summary.perfectlyTrained++;
              break;
          }
        });

        return summary;
      })
    );
  }

  /**
   * Get all quiz progress for a user (by querying userQuizzes subcollection)
   * Note: This should be used in conjunction with ParticipantService.getUserQuizzes()
   */
  getProgressSummaryForUserQuiz(quizId: string, userId: string): Observable<ProgressSummary> {
    return this.getProgressSummary(quizId, userId);
  }

  /**
   * Get all participants' progress for a quiz (for analytics/leaderboards)
   */
  getAllUsersProgressForQuiz(quizId: string): Observable<UserQuizProgress[]> {
    const userProgressCol = collection(
      this.firestore,
      `quizProgress/${quizId}/userProgress`
    ) as CollectionReference<UserQuizProgress>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(userProgressCol))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertUserQuizTimestamps(data);
        });
      })
    );
  }

  /**
   * Delete all progress for a quiz (when quiz is deleted)
   */
  async deleteQuizProgress(quizId: string): Promise<void> {
    const userProgressCol = collection(this.firestore, `quizProgress/${quizId}/userProgress`);
    const snapshot = await runInInjectionContext(this.injector, () => getDocs(userProgressCol));

    const batch = writeBatch(this.firestore);

    // Delete all user progress documents and their subcollections
    for (const userDoc of snapshot.docs) {
      // Delete question progress subcollection
      const questionProgressCol = collection(
        this.firestore,
        `quizProgress/${quizId}/userProgress/${userDoc.id}/questionProgress`
      );
      const questionSnapshot = await runInInjectionContext(this.injector, () => getDocs(questionProgressCol));
      questionSnapshot.docs.forEach(questionDoc => {
        batch.delete(questionDoc.ref);
      });

      // Delete user progress document
      batch.delete(userDoc.ref);
    }

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for UserQuizProgress
   */
  private convertUserQuizTimestamps(data: any): UserQuizProgress {
    return {
      ...data,
      lastAttemptAt: data.lastAttemptAt?.toDate() || new Date(),
      nextReviewAt: data.nextReviewAt?.toDate?.() || data.nextReviewAt
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for QuestionProgress
   */
  private convertQuestionTimestamps(data: any): QuestionProgress {
    return {
      ...data,
      lastAttemptAt: data.lastAttemptAt?.toDate() || new Date(),
      nextReviewAt: data.nextReviewAt?.toDate?.() || data.nextReviewAt
    };
  }

  private toFirestoreQuestionProgress(progress: QuestionProgress, nowTimestamp: Timestamp): Record<string, any> {
    return {
      ...progress,
      lastAttemptAt: nowTimestamp,
      nextReviewAt: progress.nextReviewAt ? Timestamp.fromDate(progress.nextReviewAt) : nowTimestamp,
      lastResponseMs: progress.lastResponseMs ?? null
    };
  }

  private async updateUserQuizProgressTimestamp(
    quizId: string,
    userId: string,
    timestamp: Timestamp
  ): Promise<void> {
    const userQuizProgressDoc = doc(this.firestore, `quizProgress/${quizId}/userProgress/${userId}`);
    await setDoc(
      userQuizProgressDoc,
      {
        userId,
        quizId,
        lastAttemptAt: timestamp
      },
      { merge: true }
    );
  }
}
