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
import { Question } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class QuestionService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private questionsCollection = collection(this.firestore, 'questions') as CollectionReference<Question>;

  /**
   * Create a new question
   */
  async createQuestion(question: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const questionDoc = doc(this.questionsCollection);
    const questionId = questionDoc.id;

    const questionData = {
      ...this.stripUndefined(question),
      id: questionId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    await setDoc(questionDoc, questionData);
    return questionId;
  }

  /**
   * Create multiple questions in a batch
   */
  async createQuestionsBatch(questions: Omit<Question, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const batch = writeBatch(this.firestore);
    const questionIds: string[] = [];

    questions.forEach((question) => {
      const questionDoc = doc(this.questionsCollection);
      const questionId = questionDoc.id;
      questionIds.push(questionId);

      const questionData = {
        ...this.stripUndefined(question),
        id: questionId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      batch.set(questionDoc, questionData);
    });

    await batch.commit();
    return questionIds;
  }

  /**
   * Get a single question by ID
   */
  getQuestionById(questionId: string): Observable<Question | null> {
    const questionDoc = doc(this.firestore, `questions/${questionId}`) as DocumentReference<Question>;
    return from(
      runInInjectionContext(this.injector, () => getDoc(questionDoc))
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
   * Get all questions for a quiz, ordered by orderIndex
   */
  getQuestionsByQuizId(quizId: string): Observable<Question[]> {
    const q = query(
      this.questionsCollection,
      where('quizId', '==', quizId),
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
   * Update a question
   */
  async updateQuestion(questionId: string, updates: Partial<Question>): Promise<void> {
    const questionDoc = doc(this.firestore, `questions/${questionId}`);
    await updateDoc(questionDoc, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  /**
   * Delete a question
   */
  async deleteQuestion(questionId: string): Promise<void> {
    const questionDoc = doc(this.firestore, `questions/${questionId}`);
    await deleteDoc(questionDoc);
  }

  /**
   * Delete all questions for a quiz
   */
  async deleteQuestionsByQuizId(quizId: string): Promise<void> {
    const q = query(
      this.questionsCollection,
      where('quizId', '==', quizId)
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(q));
    const batch = writeBatch(this.firestore);

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  /**
   * Reorder questions for a quiz
   */
  async reorderQuestions(quizId: string, questionIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);

    questionIds.forEach((questionId, index) => {
      const questionDoc = doc(this.firestore, `questions/${questionId}`);
      batch.update(questionDoc, {
        orderIndex: index,
        updatedAt: Timestamp.now()
      });
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates
   */
  private convertTimestamps(data: any): Question {
    return {
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    };
  }

  /**
   * Recursively remove `undefined` values so Firestore writes don't fail.
   * Firestore rejects `undefined` fields (e.g. optional imageUrl).
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
