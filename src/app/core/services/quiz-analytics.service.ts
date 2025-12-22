import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  where,
  increment,
  serverTimestamp,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  collectionData
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Question, QuestionAnalyticsStat, QuizAnalyticsSummary } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class QuizAnalyticsService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  async recordAnswer(
    quizId: string,
    question: Question,
    isCorrect: boolean,
    responseTimeMs: number
  ): Promise<void> {
    if (!quizId || !question?.id) return;

    const statRef = doc(this.firestore, `quizAnalytics/${quizId}/questionStats/${question.id}`);
    const safeResponseMs = Number.isFinite(responseTimeMs) ? Math.max(0, Math.round(responseTimeMs)) : 0;

    await setDoc(
      statRef,
      {
        quizId,
        questionId: question.id,
        orderIndex: question.orderIndex ?? 0,
        attempts: increment(1),
        correct: increment(isCorrect ? 1 : 0),
        incorrect: increment(isCorrect ? 0 : 1),
        totalResponseMs: increment(safeResponseMs),
        lastAttemptAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  getQuestionStats(quizId: string): Observable<QuestionAnalyticsStat[]> {
    const statsCol = collection(this.firestore, `quizAnalytics/${quizId}/questionStats`);
    const statsQuery = query(statsCol, orderBy('orderIndex', 'asc'));

    return collectionData(statsQuery, { idField: 'id' }).pipe(
      map((rows: any[]) =>
        rows.map((row) => ({
          quizId: row.quizId ?? quizId,
          questionId: row.questionId ?? row.id,
          orderIndex: row.orderIndex ?? 0,
          attempts: row.attempts ?? 0,
          correct: row.correct ?? 0,
          incorrect: row.incorrect ?? 0,
          totalResponseMs: row.totalResponseMs ?? 0,
          lastAttemptAt: row.lastAttemptAt?.toDate ? row.lastAttemptAt.toDate() : row.lastAttemptAt
        }))
      )
    );
  }

  async getQuizSummary(quizId: string): Promise<QuizAnalyticsSummary> {
    const progressCol = collection(this.firestore, `quizProgress/${quizId}/userProgress`);
    const completionQuery = query(progressCol, where('completionRate', '>=', 100));

    const [countSnap, completionSnap, sumSnap] = await Promise.all([
      runInInjectionContext(this.injector, () => getCountFromServer(progressCol)),
      runInInjectionContext(this.injector, () => getCountFromServer(completionQuery)),
      runInInjectionContext(this.injector, () =>
        getAggregateFromServer(progressCol, { completionSum: sum('completionRate') })
      )
    ]);

    const totalUsers = countSnap.data().count ?? 0;
    const completions = completionSnap.data().count ?? 0;
    const completionSum = Number(sumSnap.data().completionSum ?? 0);
    const averageCompletionRate = totalUsers > 0
      ? Math.round((completionSum / totalUsers) * 10) / 10
      : 0;

    return {
      totalUsers,
      completions,
      averageCompletionRate
    };
  }
}
