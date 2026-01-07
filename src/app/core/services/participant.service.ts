import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
  CollectionReference,
  increment
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { QuizParticipant, UserQuizReference, ParticipantRole, InvitationStatus } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class ParticipantService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Add a participant to a quiz
   */
  async addParticipant(
    quizId: string,
    userId: string,
    email: string,
    role: ParticipantRole,
    invitedBy?: string,
    status: InvitationStatus = 'pending'
  ): Promise<void> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    const existing = existingSnap.exists() ? (existingSnap.data() as QuizParticipant) : null;
    const shouldIncrement =
      this.shouldCountInTotals(role, status) &&
      !this.shouldCountInTotals(existing?.role, existing?.status);

    const batch = writeBatch(this.firestore);

    // Add to quizParticipants collection
    const participantData: QuizParticipant = {
      userId,
      email,
      role,
      invitedAt: Timestamp.now() as any,
      status,
      ...(invitedBy ? { invitedBy } : {})
    };
    batch.set(participantDoc, participantData);

    // Add to user's userQuizzes subcollection
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    const userQuizData: UserQuizReference = {
      quizId,
      role,
      addedAt: Timestamp.now() as any,
      lastAccessedAt: Timestamp.now() as any,
      tags: [],
      isFavorite: false
    };
    batch.set(userQuizDoc, userQuizData);

    await batch.commit();

    if (shouldIncrement) {
      await this.updateParticipantCount(quizId, 1);
    }
  }

  /**
   * Accept an invitation (change status from pending to accepted)
   */
  async acceptInvitation(quizId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    if (!existingSnap.exists()) return;

    const existing = existingSnap.data() as QuizParticipant;
    if (existing.status === 'accepted') return;

    await updateDoc(participantDoc, { status: 'accepted' });

    if (this.shouldCountInTotals(existing.role, 'accepted')) {
      await this.updateParticipantCount(quizId, 1);
    }
  }

  /**
   * Remove a participant from a quiz
   */
  async removeParticipant(quizId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    const existing = existingSnap.exists() ? (existingSnap.data() as QuizParticipant) : null;
    const shouldDecrement = this.shouldCountInTotals(existing?.role, existing?.status);

    const batch = writeBatch(this.firestore);

    if (shouldDecrement) {
      const currentCount = await this.getCurrentParticipantCount(quizId);
      if (currentCount > 0) {
        batch.update(doc(this.firestore, `quizzes/${quizId}`), {
          'metadata.totalParticipants': increment(-1)
        });
      }
    }

    // Remove from quizParticipants
    batch.delete(participantDoc);

    // Remove from user's userQuizzes
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    batch.delete(userQuizDoc);

    await batch.commit();
  }

  /**
   * Update participant role
   */
  async updateParticipantRole(quizId: string, userId: string, newRole: ParticipantRole): Promise<void> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    if (!existingSnap.exists()) return;

    const existing = existingSnap.data() as QuizParticipant;
    if (existing.role === newRole) return;

    const wasCounted = this.shouldCountInTotals(existing.role, existing.status);
    const willCount = this.shouldCountInTotals(newRole, existing.status);
    const delta = willCount && !wasCounted ? 1 : (!willCount && wasCounted ? -1 : 0);

    const batch = writeBatch(this.firestore);

    // Update in quizParticipants
    batch.update(participantDoc, { role: newRole });

    // Update in user's userQuizzes
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    batch.update(userQuizDoc, { role: newRole });

    if (delta !== 0) {
      if (delta < 0) {
        const currentCount = await this.getCurrentParticipantCount(quizId);
        if (currentCount > 0) {
          batch.update(doc(this.firestore, `quizzes/${quizId}`), {
            'metadata.totalParticipants': increment(delta)
          });
        }
      } else {
        batch.update(doc(this.firestore, `quizzes/${quizId}`), {
          'metadata.totalParticipants': increment(delta)
        });
      }
    }

    await batch.commit();
  }

  private shouldCountInTotals(role?: ParticipantRole, status?: InvitationStatus): boolean {
    return role === 'participant' && status === 'accepted';
  }

  private async updateParticipantCount(quizId: string, delta: number): Promise<void> {
    if (!quizId || !Number.isFinite(delta) || delta === 0) return;
    try {
      await updateDoc(doc(this.firestore, `quizzes/${quizId}`), {
        'metadata.totalParticipants': increment(delta)
      });
    } catch (error) {
      console.warn('Failed to update quiz participant count:', error);
    }
  }

  private async getCurrentParticipantCount(quizId: string): Promise<number> {
    try {
      const quizDoc = doc(this.firestore, `quizzes/${quizId}`);
      const snap = await runInInjectionContext(this.injector, () => getDoc(quizDoc));
      if (!snap.exists()) return 0;
      const raw = snap.data()?.['metadata']?.['totalParticipants'];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    } catch (error) {
      console.warn('Failed to read quiz participant count:', error);
      return 0;
    }
  }

  /**
   * Get all participants for a quiz
   */
  getParticipantsByQuizId(quizId: string): Observable<QuizParticipant[]> {
    const participantsCol = collection(
      this.firestore,
      `quizParticipants/${quizId}/participants`
    ) as CollectionReference<QuizParticipant>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(participantsCol))
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
   * Get a specific participant
   */
  getParticipant(quizId: string, userId: string): Observable<QuizParticipant | null> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(participantDoc))
    ).pipe(
      map(docSnap => {
        if (!docSnap.exists()) {
          return null;
        }
        const data = docSnap.data() as any;
        return this.convertTimestamps(data);
      })
    );
  }

  /**
   * Get a specific participant (async version for use in access checks)
   */
  async getParticipantAsync(quizId: string, userId: string): Promise<QuizParticipant | null> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as any;
    return this.convertTimestamps(data);
  }

  /**
   * Get all quizzes for a user (from userQuizzes subcollection)
   */
  getUserQuizzes(userId: string): Observable<UserQuizReference[]> {
    const userQuizzesCol = collection(
      this.firestore,
      `users/${userId}/userQuizzes`
    ) as CollectionReference<UserQuizReference>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(userQuizzesCol))
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
   * Get quizzes by role for a user
   */
  getUserQuizzesByRole(userId: string, role: ParticipantRole): Observable<UserQuizReference[]> {
    const userQuizzesCol = collection(
      this.firestore,
      `users/${userId}/userQuizzes`
    ) as CollectionReference<UserQuizReference>;

    const q = query(userQuizzesCol, where('role', '==', role));

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
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
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: string, quizId: string): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    await updateDoc(userQuizDoc, {
      lastAccessedAt: Timestamp.now()
    });
  }

  /**
   * Check if user has a specific role for a quiz
   */
  async hasRole(quizId: string, userId: string, role: ParticipantRole): Promise<boolean> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as QuizParticipant;
    return data.role === role;
  }

  /**
   * Check if user can edit quiz (is owner or co-author)
   */
  async canEdit(quizId: string, userId: string): Promise<boolean> {
    const participantDoc = doc(this.firestore, `quizParticipants/${quizId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as QuizParticipant;
    return data.role === 'owner' || data.role === 'co-author';
  }

  /**
   * Delete all participants for a quiz (used when deleting a quiz)
   * Also removes userQuizzes references from each user
   */
  async deleteAllParticipants(quizId: string): Promise<void> {
    const participantsCol = collection(
      this.firestore,
      `quizParticipants/${quizId}/participants`
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    if (snapshot.empty) {
      return;
    }

    const batch = writeBatch(this.firestore);

    snapshot.docs.forEach(participantDoc => {
      const data = participantDoc.data() as QuizParticipant;

      // Delete from quizParticipants
      batch.delete(participantDoc.ref);

      // Delete from user's userQuizzes
      const userQuizDoc = doc(this.firestore, `users/${data.userId}/userQuizzes/${quizId}`);
      batch.delete(userQuizDoc);
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for QuizParticipant
   */
  private convertTimestamps(data: any): QuizParticipant {
    return {
      ...data,
      invitedAt: data.invitedAt?.toDate() || new Date()
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for UserQuizReference
   */
  private convertUserQuizTimestamps(data: any): UserQuizReference {
    return {
      ...data,
      addedAt: data.addedAt?.toDate() || new Date(),
      lastAccessedAt: data.lastAccessedAt?.toDate() || new Date(),
      tags: data.tags || [],
      isFavorite: data.isFavorite || false
    };
  }

  // ===== Organization Methods =====

  /**
   * Set favorite status for a quiz
   * Uses setDoc with merge to create the document if it doesn't exist
   */
  async setFavorite(userId: string, quizId: string, isFavorite: boolean): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(userQuizDoc));

    if (docSnap.exists()) {
      await updateDoc(userQuizDoc, { isFavorite });
    } else {
      // Create document with default values if it doesn't exist
      const userQuizData: UserQuizReference = {
        quizId,
        role: 'participant',
        addedAt: Timestamp.now() as any,
        lastAccessedAt: Timestamp.now() as any,
        tags: [],
        isFavorite
      };
      await setDoc(userQuizDoc, userQuizData);
    }
  }

  /**
   * Set folder for a quiz
   */
  async setFolder(userId: string, quizId: string, folderId: string | null): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    if (folderId === null) {
      await updateDoc(userQuizDoc, { folderId: deleteField() });
    } else {
      await updateDoc(userQuizDoc, { folderId });
    }
  }

  /**
   * Set tags for a quiz (replaces all tags)
   */
  async setTags(userId: string, quizId: string, tags: string[]): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    await updateDoc(userQuizDoc, { tags });
  }

  /**
   * Add a tag to a quiz
   */
  async addTag(userId: string, quizId: string, tag: string): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(userQuizDoc));
    if (!docSnap.exists()) return;

    const data = docSnap.data() as UserQuizReference;
    const currentTags = data.tags || [];
    if (!currentTags.includes(tag)) {
      await updateDoc(userQuizDoc, { tags: [...currentTags, tag] });
    }
  }

  /**
   * Remove a tag from a quiz
   */
  async removeTag(userId: string, quizId: string, tag: string): Promise<void> {
    const userQuizDoc = doc(this.firestore, `users/${userId}/userQuizzes/${quizId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(userQuizDoc));
    if (!docSnap.exists()) return;

    const data = docSnap.data() as UserQuizReference;
    const currentTags = data.tags || [];
    await updateDoc(userQuizDoc, { tags: currentTags.filter(t => t !== tag) });
  }

  /**
   * Get all favorite quizzes for a user
   */
  getFavoriteQuizzes(userId: string): Observable<UserQuizReference[]> {
    const userQuizzesCol = collection(
      this.firestore,
      `users/${userId}/userQuizzes`
    ) as CollectionReference<UserQuizReference>;

    const q = query(userQuizzesCol, where('isFavorite', '==', true));

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
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
   * Get quizzes by folder for a user
   */
  getQuizzesByFolder(userId: string, folderId: string): Observable<UserQuizReference[]> {
    const userQuizzesCol = collection(
      this.firestore,
      `users/${userId}/userQuizzes`
    ) as CollectionReference<UserQuizReference>;

    const q = query(userQuizzesCol, where('folderId', '==', folderId));

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertUserQuizTimestamps(data);
        });
      })
    );
  }
}
