import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  updateDoc,
  increment,
  writeBatch,
  DocumentReference,
  Timestamp
} from '@angular/fire/firestore';
import { UserLookupService } from './user-lookup.service';

interface ExportQuizProgress {
  summary: any;
  questions: any[];
}

interface ExportDeckProgress {
  summary: any;
  cards: any[];
}

@Injectable({
  providedIn: 'root'
})
export class AccountDataService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private userLookup = inject(UserLookupService);

  async exportUserData(userId: string): Promise<Record<string, any>> {
    const [
      userDoc,
      userQuizzes,
      userDecks,
      userMaterials,
      fcmTokens,
      notifications,
      folders,
      followers,
      following,
      followNotifications,
      followNotificationsSent
    ] = await Promise.all([
      this.safeGetDocData(`users/${userId}`),
      this.safeGetCollectionData(`users/${userId}/userQuizzes`),
      this.safeGetCollectionData(`users/${userId}/userDecks`),
      this.safeGetCollectionData(`users/${userId}/userMaterials`),
      this.safeGetCollectionData(`users/${userId}/fcmTokens`),
      this.safeGetCollectionDataByField('notifications', 'userId', userId),
      this.safeGetCollectionData(`users/${userId}/folders`),
      this.safeGetCollectionData(`users/${userId}/followers`),
      this.safeGetCollectionData(`users/${userId}/following`),
      this.safeGetCollectionDataByField('followNotifications', 'userId', userId),
      this.safeGetCollectionDataByField('followNotifications', 'authorId', userId)
    ]);

    const ownedQuizzes = await this.getOwnedCollection('quizzes', userId);
    const ownedDecks = await this.getOwnedCollection('flashcardDecks', userId);
    const ownedMaterials = await this.getOwnedCollection('learningMaterials', userId);
    const ownedThemes = await this.getOwnedCollection('themes', userId);

    const quizQuestions: Record<string, any[]> = {};
    const quizAnalytics: Record<string, any[]> = {};

    for (const quiz of ownedQuizzes) {
      const quizId = quiz.id as string;
      quizQuestions[quizId] = await this.getCollectionDataByField('questions', 'quizId', quizId);
      quizAnalytics[quizId] = await this.getCollectionData(`quizAnalytics/${quizId}/questionStats`);
    }

    const deckCards: Record<string, any[]> = {};
    for (const deck of ownedDecks) {
      const deckId = deck.id as string;
      deckCards[deckId] = await this.getCollectionDataByField('flashcards', 'deckId', deckId);
    }

    const quizProgress: Record<string, ExportQuizProgress> = {};
    for (const ref of userQuizzes) {
      const quizId = ref.quizId as string;
      const summary = await this.getDocData(`quizProgress/${quizId}/userProgress/${userId}`);
      if (summary) {
        const questions = await this.getCollectionData(
          `quizProgress/${quizId}/userProgress/${userId}/questionProgress`
        );
        quizProgress[quizId] = { summary, questions };
      }
    }

    const deckProgress: Record<string, ExportDeckProgress> = {};
    for (const ref of userDecks) {
      const deckId = ref.deckId as string;
      const summary = await this.getDocData(`flashcardProgress/${deckId}/userProgress/${userId}`);
      if (summary) {
        const cards = await this.getCollectionData(
          `flashcardProgress/${deckId}/userProgress/${userId}/cardProgress`
        );
        deckProgress[deckId] = { summary, cards };
      }
    }

    const reviews = await this.safeGetCollectionDataByField('reviews', 'userId', userId);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: userDoc,
      userQuizzes,
      userDecks,
      userMaterials,
      fcmTokens,
      notifications,
      folders,
      followers,
      following,
      followNotifications,
      followNotificationsSent,
      ownedQuizzes,
      ownedDecks,
      ownedMaterials,
      ownedThemes,
      quizQuestions,
      deckCards,
      quizAnalytics,
      quizProgress,
      deckProgress,
      reviews
    };

    return this.serialize(payload);
  }

  async deleteUserData(userId: string, email?: string): Promise<void> {
    const userQuizzes = await this.runDeleteStep('Load userQuizzes', () =>
      this.getCollectionData(`users/${userId}/userQuizzes`)
    );
    const userDecks = await this.runDeleteStep('Load userDecks', () =>
      this.getCollectionData(`users/${userId}/userDecks`)
    );
    const userMaterials = await this.runDeleteStep('Load userMaterials', () =>
      this.getCollectionData(`users/${userId}/userMaterials`)
    );
    const userFollowing = await this.runDeleteStep('Load following', () =>
      this.getCollectionData(`users/${userId}/following`)
    );
    const userFollowers = await this.runDeleteStep('Load followers', () =>
      this.getCollectionData(`users/${userId}/followers`)
    );

    // Remove quiz participation + progress
    for (const ref of userQuizzes) {
      const quizId = ref.quizId as string;
      await this.runDeleteStep(`Delete quiz progress questions (${quizId})`, () =>
        this.deleteCollectionDocs(`quizProgress/${quizId}/userProgress/${userId}/questionProgress`)
      );
      await this.runDeleteStep(`Delete quiz progress summary (${quizId})`, () =>
        this.safeDeleteDoc(`quizProgress/${quizId}/userProgress/${userId}`)
      );
      await this.runDeleteStep(`Delete quiz participant (${quizId})`, () =>
        this.safeDeleteDoc(`quizParticipants/${quizId}/participants/${userId}`)
      );
      await this.runDeleteStep(`Delete user quiz ref (${quizId})`, () =>
        this.safeDeleteDoc(`users/${userId}/userQuizzes/${quizId}`)
      );
    }

    // Remove deck participation + progress
    for (const ref of userDecks) {
      const deckId = ref.deckId as string;
      await this.runDeleteStep(`Delete deck progress cards (${deckId})`, () =>
        this.deleteCollectionDocs(`flashcardProgress/${deckId}/userProgress/${userId}/cardProgress`)
      );
      await this.runDeleteStep(`Delete deck progress summary (${deckId})`, () =>
        this.safeDeleteDoc(`flashcardProgress/${deckId}/userProgress/${userId}`)
      );
      await this.runDeleteStep(`Delete deck participant (${deckId})`, () =>
        this.safeDeleteDoc(`deckParticipants/${deckId}/participants/${userId}`)
      );
      await this.runDeleteStep(`Delete user deck ref (${deckId})`, () =>
        this.safeDeleteDoc(`users/${userId}/userDecks/${deckId}`)
      );
    }

    // Remove material participation
    for (const ref of userMaterials) {
      const materialId = ref.materialId as string;
      await this.runDeleteStep(`Delete material participant (${materialId})`, () =>
        this.safeDeleteDoc(`materialParticipants/${materialId}/participants/${userId}`)
      );
      await this.runDeleteStep(`Delete user material ref (${materialId})`, () =>
        this.safeDeleteDoc(`users/${userId}/userMaterials/${materialId}`)
      );
    }

    // Delete owned content
    const ownedQuizzes = await this.runDeleteStep('Load owned quizzes', () =>
      this.getOwnedCollection('quizzes', userId)
    );
    for (const quiz of ownedQuizzes) {
      const quizId = quiz.id as string;
      await this.runDeleteStep(`Delete quiz analytics (${quizId})`, () =>
        this.deleteCollectionDocs(`quizAnalytics/${quizId}/questionStats`)
      );
      await this.runDeleteStep(`Delete quiz questions (${quizId})`, () =>
        this.deleteCollectionDocsByField('questions', 'quizId', quizId)
      );
      await this.runDeleteStep(`Delete quiz participants (${quizId})`, () =>
        this.deleteQuizParticipantsWithRefs(quizId)
      );
      await this.runDeleteStep(`Delete quiz doc (${quizId})`, () =>
        this.safeDeleteDoc(`quizzes/${quizId}`)
      );
    }

    const ownedDecks = await this.runDeleteStep('Load owned decks', () =>
      this.getOwnedCollection('flashcardDecks', userId)
    );
    for (const deck of ownedDecks) {
      const deckId = deck.id as string;
      await this.runDeleteStep(`Delete deck cards (${deckId})`, () =>
        this.deleteCollectionDocsByField('flashcards', 'deckId', deckId)
      );
      await this.runDeleteStep(`Delete deck participants (${deckId})`, () =>
        this.deleteDeckParticipantsWithRefs(deckId)
      );
      await this.runDeleteStep(`Delete deck doc (${deckId})`, () =>
        this.safeDeleteDoc(`flashcardDecks/${deckId}`)
      );
    }

    const ownedMaterials = await this.runDeleteStep('Load owned materials', () =>
      this.getOwnedCollection('learningMaterials', userId)
    );
    for (const material of ownedMaterials) {
      const materialId = material.id as string;
      await this.runDeleteStep(`Delete material participants (${materialId})`, () =>
        this.deleteMaterialParticipantsWithRefs(materialId)
      );
      await this.runDeleteStep(`Delete material doc (${materialId})`, () =>
        this.safeDeleteDoc(`learningMaterials/${materialId}`)
      );
    }

    const ownedThemes = await this.runDeleteStep('Load owned themes', () =>
      this.getOwnedCollection('themes', userId)
    );
    for (const theme of ownedThemes) {
      const themeId = theme.id as string;
      await this.runDeleteStep(`Delete theme (${themeId})`, () =>
        this.safeDeleteDoc(`themes/${themeId}`)
      );
    }

    const reviews = await this.runDeleteStep('Load reviews', () =>
      this.getCollectionDataByField('reviews', 'userId', userId)
    );
    for (const review of reviews) {
      const reviewId = review.id as string;
      await this.runDeleteStep(`Delete review (${reviewId})`, () =>
        this.safeDeleteDoc(`reviews/${reviewId}`)
      );
    }

    await this.runDeleteStep('Delete notifications', () =>
      this.deleteCollectionDocsByField('notifications', 'userId', userId)
    );
    await this.runDeleteStep('Delete followNotifications (recipient)', () =>
      this.deleteCollectionDocsByField('followNotifications', 'userId', userId)
    );
    await this.runDeleteStep('Delete followNotifications (author)', () =>
      this.deleteCollectionDocsByField('followNotifications', 'authorId', userId)
    );
    await this.runDeleteStep('Delete FCM tokens', () =>
      this.deleteCollectionDocs(`users/${userId}/fcmTokens`)
    );
    await this.runDeleteStep('Delete folders', () =>
      this.deleteCollectionDocs(`users/${userId}/folders`)
    );

    await this.runDeleteStep('Remove follow relations', () =>
      this.removeFollowRelations(userId, userFollowing, userFollowers)
    );
    await this.runDeleteStep('Delete following', () =>
      this.deleteCollectionDocs(`users/${userId}/following`)
    );
    await this.runDeleteStep('Delete followers', () =>
      this.deleteCollectionDocs(`users/${userId}/followers`)
    );

    // Remove user document
    await this.runDeleteStep('Delete user document', () =>
      this.safeDeleteDoc(`users/${userId}`)
    );

    // Attempt to remove email lookup (may require backend permission)
    if (email) {
      try {
        await this.userLookup.deleteEmailLookup(email);
      } catch (error) {
        console.warn('Could not delete email lookup:', error);
      }
    }
  }

  private async getDocData(path: string): Promise<any | null> {
    const ref = doc(this.firestore, path);
    const snap = await runInInjectionContext(this.injector, () => getDoc(ref));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  private async getCollectionData(path: string): Promise<any[]> {
    const col = collection(this.firestore, path);
    const snap = await runInInjectionContext(this.injector, () => getDocs(col));
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  private async getOwnedCollection(collectionName: string, userId: string): Promise<any[]> {
    const col = collection(this.firestore, collectionName);
    const q = query(col, where('ownerId', '==', userId));
    const snap = await runInInjectionContext(this.injector, () => getDocs(q));
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  private async getCollectionDataByField(collectionName: string, field: string, value: string): Promise<any[]> {
    const col = collection(this.firestore, collectionName);
    const q = query(col, where(field, '==', value));
    const snap = await runInInjectionContext(this.injector, () => getDocs(q));
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  }

  private async safeGetDocData(path: string): Promise<any | null> {
    try {
      return await this.getDocData(path);
    } catch (error) {
      console.warn(`Failed to read ${path}:`, error);
      return null;
    }
  }

  private async safeGetCollectionData(path: string): Promise<any[]> {
    try {
      return await this.getCollectionData(path);
    } catch (error) {
      console.warn(`Failed to read ${path}:`, error);
      return [];
    }
  }

  private async safeGetCollectionDataByField(collectionName: string, field: string, value: string): Promise<any[]> {
    try {
      return await this.getCollectionDataByField(collectionName, field, value);
    } catch (error) {
      console.warn(`Failed to read ${collectionName} by ${field}:`, error);
      return [];
    }
  }

  private async deleteQuizParticipantsWithRefs(quizId: string): Promise<void> {
    const participantsCol = collection(this.firestore, `quizParticipants/${quizId}/participants`);
    const snap = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    const refs: DocumentReference[] = [];
    snap.docs.forEach(docSnap => {
      refs.push(docSnap.ref);
      const data = docSnap.data() as any;
      if (data?.userId) {
        refs.push(doc(this.firestore, `users/${data.userId}/userQuizzes/${quizId}`));
      }
    });

    await this.deleteDocsInBatches(refs);
  }

  private async deleteDeckParticipantsWithRefs(deckId: string): Promise<void> {
    const participantsCol = collection(this.firestore, `deckParticipants/${deckId}/participants`);
    const snap = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    const refs: DocumentReference[] = [];
    snap.docs.forEach(docSnap => {
      refs.push(docSnap.ref);
      const data = docSnap.data() as any;
      if (data?.userId) {
        refs.push(doc(this.firestore, `users/${data.userId}/userDecks/${deckId}`));
      }
    });

    await this.deleteDocsInBatches(refs);
  }

  private async deleteMaterialParticipantsWithRefs(materialId: string): Promise<void> {
    const participantsCol = collection(this.firestore, `materialParticipants/${materialId}/participants`);
    const snap = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    const refs: DocumentReference[] = [];
    snap.docs.forEach(docSnap => {
      refs.push(docSnap.ref);
      const data = docSnap.data() as any;
      if (data?.userId) {
        refs.push(doc(this.firestore, `users/${data.userId}/userMaterials/${materialId}`));
      }
    });

    await this.deleteDocsInBatches(refs);
  }

  private async deleteCollectionDocs(path: string): Promise<void> {
    const col = collection(this.firestore, path);
    const snap = await runInInjectionContext(this.injector, () => getDocs(col));
    await this.deleteDocsInBatches(snap.docs.map(docSnap => docSnap.ref));
  }

  private async deleteCollectionDocsByField(collectionName: string, field: string, value: string): Promise<void> {
    const col = collection(this.firestore, collectionName);
    const q = query(col, where(field, '==', value));
    const snap = await runInInjectionContext(this.injector, () => getDocs(q));
    await this.deleteDocsInBatches(snap.docs.map(docSnap => docSnap.ref));
  }

  private async deleteDocsInBatches(refs: DocumentReference[]): Promise<void> {
    if (refs.length === 0) return;

    const chunkSize = 400;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const chunk = refs.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  }

  private async safeDeleteDoc(path: string): Promise<void> {
    const ref = doc(this.firestore, path);
    await deleteDoc(ref);
  }

  private async safeIncrement(path: string, field: string, delta: number): Promise<void> {
    try {
      const ref = doc(this.firestore, path);
      await updateDoc(ref, { [field]: increment(delta) });
    } catch (error) {
      console.warn(`Could not update ${field} for ${path}:`, error);
    }
  }

  private async removeFollowRelations(
    userId: string,
    following: any[],
    followers: any[]
  ): Promise<void> {
    for (const entry of following) {
      const targetUserId = entry.followedUserId || entry.id;
      if (!targetUserId) continue;
      try {
        await this.safeDeleteDoc(`users/${userId}/following/${targetUserId}`);
        await this.safeDeleteDoc(`users/${targetUserId}/followers/${userId}`);
        await this.safeIncrement(`users/${targetUserId}`, 'followerCount', -1);
      } catch (error) {
        console.warn('Failed to remove following relation:', error);
      }
    }

    for (const entry of followers) {
      const followerId = entry.followerId || entry.id;
      if (!followerId) continue;
      try {
        await this.safeDeleteDoc(`users/${userId}/followers/${followerId}`);
        await this.safeDeleteDoc(`users/${followerId}/following/${userId}`);
        await this.safeIncrement(`users/${followerId}`, 'followingCount', -1);
      } catch (error) {
        console.warn('Failed to remove follower relation:', error);
      }
    }
  }

  private serialize(value: any): any {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map(item => this.serialize(item));
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([key, val]) => [key, this.serialize(val)]);
      return Object.fromEntries(entries);
    }
    return value;
  }

  private async runDeleteStep<T>(_label: string, fn: () => Promise<T>): Promise<T> {
    return await fn();
  }
}
