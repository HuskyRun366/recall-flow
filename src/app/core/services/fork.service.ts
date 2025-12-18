import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import {
  Quiz,
  FlashcardDeck,
  LearningMaterial,
  Question,
  Flashcard,
  ForkedFromInfo
} from '../../models';

@Injectable({
  providedIn: 'root'
})
export class ForkService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Remove undefined values from an object (Firestore doesn't accept undefined)
   */
  private stripUndefined<T extends Record<string, any>>(obj: T): T {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result as T;
  }

  /**
   * Fork a quiz - creates a copy owned by the current user
   * Includes all questions
   */
  async forkQuiz(
    originalQuiz: Quiz,
    userId: string,
    userEmail: string,
    ownerDisplayName?: string
  ): Promise<string> {
    const batch = writeBatch(this.firestore);

    // 1. Create new quiz document
    const newQuizRef = doc(collection(this.firestore, 'quizzes'));
    const newQuizId = newQuizRef.id;

    const forkedFrom: ForkedFromInfo = {
      id: originalQuiz.id,
      title: originalQuiz.title,
      ownerName: ownerDisplayName || 'Unknown'
    };

    const forkedQuiz = {
      id: newQuizId,
      title: `${originalQuiz.title} (Copy)`,
      description: originalQuiz.description,
      ownerId: userId,
      visibility: 'private' as const, // Start as private
      questionCount: originalQuiz.questionCount,
      category: originalQuiz.category,
      difficulty: originalQuiz.difficulty,
      language: originalQuiz.language,
      metadata: {
        totalParticipants: 0,
        totalCompletions: 0
      },
      forkedFrom,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    batch.set(newQuizRef, this.stripUndefined(forkedQuiz));

    // 2. Copy all questions
    const questionsRef = collection(this.firestore, 'questions');
    const questionsQuery = query(questionsRef, where('quizId', '==', originalQuiz.id));
    const questionsSnapshot = await runInInjectionContext(this.injector, () => getDocs(questionsQuery));

    questionsSnapshot.docs.forEach(questionDoc => {
      const question = questionDoc.data() as Question;
      const newQuestionRef = doc(collection(this.firestore, 'questions'));

      const newQuestion = {
        ...question,
        id: newQuestionRef.id,
        quizId: newQuizId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      batch.set(newQuestionRef, newQuestion);
    });

    // 3. Add user as owner in quizParticipants
    const participantRef = doc(
      this.firestore,
      `quizParticipants/${newQuizId}/participants/${userId}`
    );
    batch.set(participantRef, {
      userId,
      email: userEmail,
      role: 'owner',
      status: 'accepted',
      invitedAt: Timestamp.now()
    });

    // 4. Add to user's userQuizzes
    const userQuizRef = doc(
      this.firestore,
      `users/${userId}/userQuizzes/${newQuizId}`
    );
    batch.set(userQuizRef, {
      quizId: newQuizId,
      role: 'owner',
      addedAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now()
    });

    await batch.commit();
    return newQuizId;
  }

  /**
   * Fork a flashcard deck - creates a copy owned by the current user
   * Includes all flashcards
   */
  async forkDeck(
    originalDeck: FlashcardDeck,
    userId: string,
    userEmail: string,
    ownerDisplayName?: string
  ): Promise<string> {
    const batch = writeBatch(this.firestore);

    // 1. Create new deck document
    const newDeckRef = doc(collection(this.firestore, 'flashcardDecks'));
    const newDeckId = newDeckRef.id;

    const forkedFrom: ForkedFromInfo = {
      id: originalDeck.id,
      title: originalDeck.title,
      ownerName: ownerDisplayName || 'Unknown'
    };

    const forkedDeck = {
      id: newDeckId,
      title: `${originalDeck.title} (Copy)`,
      description: originalDeck.description,
      ownerId: userId,
      visibility: 'private' as const,
      cardCount: originalDeck.cardCount,
      tags: [...originalDeck.tags],
      category: originalDeck.category,
      difficulty: originalDeck.difficulty,
      language: originalDeck.language,
      metadata: {
        totalStudents: 0,
        totalCompletions: 0
      },
      forkedFrom,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    batch.set(newDeckRef, this.stripUndefined(forkedDeck));

    // 2. Copy all flashcards
    const flashcardsRef = collection(this.firestore, 'flashcards');
    const flashcardsQuery = query(flashcardsRef, where('deckId', '==', originalDeck.id));
    const flashcardsSnapshot = await runInInjectionContext(this.injector, () => getDocs(flashcardsQuery));

    flashcardsSnapshot.docs.forEach(cardDoc => {
      const card = cardDoc.data() as Flashcard;
      const newCardRef = doc(collection(this.firestore, 'flashcards'));

      const newCard = {
        ...card,
        id: newCardRef.id,
        deckId: newDeckId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      batch.set(newCardRef, newCard);
    });

    // 3. Add user as owner in deckParticipants
    const participantRef = doc(
      this.firestore,
      `deckParticipants/${newDeckId}/participants/${userId}`
    );
    batch.set(participantRef, {
      userId,
      email: userEmail,
      role: 'owner',
      status: 'accepted',
      invitedAt: Timestamp.now()
    });

    // 4. Add to user's userDecks
    const userDeckRef = doc(
      this.firestore,
      `users/${userId}/userDecks/${newDeckId}`
    );
    batch.set(userDeckRef, {
      deckId: newDeckId,
      role: 'owner',
      addedAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now()
    });

    await batch.commit();
    return newDeckId;
  }

  /**
   * Fork a learning material - creates a copy owned by the current user
   */
  async forkMaterial(
    originalMaterial: LearningMaterial,
    userId: string,
    userEmail: string,
    ownerDisplayName?: string
  ): Promise<string> {
    const batch = writeBatch(this.firestore);

    // 1. Create new material document
    const newMaterialRef = doc(collection(this.firestore, 'learningMaterials'));
    const newMaterialId = newMaterialRef.id;

    const forkedFrom: ForkedFromInfo = {
      id: originalMaterial.id,
      title: originalMaterial.title,
      ownerName: ownerDisplayName || 'Unknown'
    };

    const forkedMaterial = {
      id: newMaterialId,
      title: `${originalMaterial.title} (Copy)`,
      description: originalMaterial.description,
      ownerId: userId,
      visibility: 'private' as const,
      htmlContent: originalMaterial.htmlContent,
      contentSize: originalMaterial.contentSize,
      tags: [...originalMaterial.tags],
      category: originalMaterial.category,
      difficulty: originalMaterial.difficulty,
      language: originalMaterial.language,
      metadata: {
        totalStudents: 0,
        totalViews: 0
      },
      forkedFrom,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    batch.set(newMaterialRef, forkedMaterial);

    // 2. Add user as owner in materialParticipants
    const participantRef = doc(
      this.firestore,
      `materialParticipants/${newMaterialId}/participants/${userId}`
    );
    batch.set(participantRef, {
      userId,
      email: userEmail,
      role: 'owner',
      status: 'accepted',
      invitedAt: Timestamp.now()
    });

    // 3. Add to user's userMaterials
    const userMaterialRef = doc(
      this.firestore,
      `users/${userId}/userMaterials/${newMaterialId}`
    );
    batch.set(userMaterialRef, {
      materialId: newMaterialId,
      role: 'owner',
      addedAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now()
    });

    await batch.commit();
    return newMaterialId;
  }

  /**
   * Get the owner's display name for attribution
   */
  async getOwnerDisplayName(ownerId: string): Promise<string> {
    const userRef = doc(this.firestore, `users/${ownerId}`);
    const userSnap = await runInInjectionContext(this.injector, () => getDoc(userRef));

    if (userSnap.exists()) {
      const userData = userSnap.data();
      return userData['displayName'] || userData['email'] || 'Unknown';
    }

    return 'Unknown';
  }
}
