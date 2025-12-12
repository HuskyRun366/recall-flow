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
  Timestamp,
  writeBatch,
  CollectionReference
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { DeckParticipant, UserDeckReference } from '../../models';

type DeckParticipantRole = 'owner' | 'co-author' | 'student';
type InvitationStatus = 'pending' | 'accepted';

@Injectable({
  providedIn: 'root'
})
export class DeckParticipantService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Add a participant to a deck
   */
  async addParticipant(
    deckId: string,
    userId: string,
    email: string,
    role: DeckParticipantRole,
    invitedBy?: string,
    status: InvitationStatus = 'pending'
  ): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Add to deckParticipants collection
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    const participantData: DeckParticipant = {
      userId,
      email,
      role,
      invitedBy,
      invitedAt: Timestamp.now() as any,
      status
    };
    batch.set(participantDoc, participantData);

    // Add to user's userDecks subcollection
    const userDeckDoc = doc(this.firestore, `users/${userId}/userDecks/${deckId}`);
    const userDeckData: UserDeckReference = {
      deckId,
      role,
      addedAt: Timestamp.now() as any,
      lastAccessedAt: Timestamp.now() as any
    };
    batch.set(userDeckDoc, userDeckData);

    await batch.commit();
  }

  /**
   * Accept an invitation (change status from pending to accepted)
   */
  async acceptInvitation(deckId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    await updateDoc(participantDoc, {
      status: 'accepted'
    });
  }

  /**
   * Remove a participant from a deck
   */
  async removeParticipant(deckId: string, userId: string): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Remove from deckParticipants
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    batch.delete(participantDoc);

    // Remove from user's userDecks
    const userDeckDoc = doc(this.firestore, `users/${userId}/userDecks/${deckId}`);
    batch.delete(userDeckDoc);

    await batch.commit();
  }

  /**
   * Update participant role
   */
  async updateParticipantRole(deckId: string, userId: string, newRole: DeckParticipantRole): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Update in deckParticipants
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    batch.update(participantDoc, { role: newRole });

    // Update in user's userDecks
    const userDeckDoc = doc(this.firestore, `users/${userId}/userDecks/${deckId}`);
    batch.update(userDeckDoc, { role: newRole });

    await batch.commit();
  }

  /**
   * Get all participants for a deck
   */
  getParticipantsByDeckId(deckId: string): Observable<DeckParticipant[]> {
    const participantsCol = collection(
      this.firestore,
      `deckParticipants/${deckId}/participants`
    ) as CollectionReference<DeckParticipant>;

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
  getParticipant(deckId: string, userId: string): Observable<DeckParticipant | null> {
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
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
  async getParticipantAsync(deckId: string, userId: string): Promise<DeckParticipant | null> {
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as any;
    return this.convertTimestamps(data);
  }

  /**
   * Get all decks for a user (from userDecks subcollection)
   */
  getUserDecks(userId: string): Observable<UserDeckReference[]> {
    const userDecksCol = collection(
      this.firestore,
      `users/${userId}/userDecks`
    ) as CollectionReference<UserDeckReference>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(userDecksCol))
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
   * Get decks by role for a user
   */
  getUserDecksByRole(userId: string, role: DeckParticipantRole): Observable<UserDeckReference[]> {
    const userDecksCol = collection(
      this.firestore,
      `users/${userId}/userDecks`
    ) as CollectionReference<UserDeckReference>;

    const q = query(userDecksCol, where('role', '==', role));

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
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
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: string, deckId: string): Promise<void> {
    const userDeckDoc = doc(this.firestore, `users/${userId}/userDecks/${deckId}`);
    await updateDoc(userDeckDoc, {
      lastAccessedAt: Timestamp.now()
    });
  }

  /**
   * Check if user has a specific role for a deck
   */
  async hasRole(deckId: string, userId: string, role: DeckParticipantRole): Promise<boolean> {
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as DeckParticipant;
    return data.role === role;
  }

  /**
   * Check if user can edit deck (is owner or co-author)
   */
  async canEdit(deckId: string, userId: string): Promise<boolean> {
    const participantDoc = doc(this.firestore, `deckParticipants/${deckId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as DeckParticipant;
    return data.role === 'owner' || data.role === 'co-author';
  }

  /**
   * Delete all participants for a deck (used when deleting a deck)
   * Also removes userDecks references from each user
   */
  async deleteAllParticipants(deckId: string): Promise<void> {
    const participantsCol = collection(
      this.firestore,
      `deckParticipants/${deckId}/participants`
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    if (snapshot.empty) {
      return;
    }

    const batch = writeBatch(this.firestore);

    snapshot.docs.forEach(participantDoc => {
      const data = participantDoc.data() as DeckParticipant;

      // Delete from deckParticipants
      batch.delete(participantDoc.ref);

      // Delete from user's userDecks
      const userDeckDoc = doc(this.firestore, `users/${data.userId}/userDecks/${deckId}`);
      batch.delete(userDeckDoc);
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for DeckParticipant
   */
  private convertTimestamps(data: any): DeckParticipant {
    return {
      ...data,
      invitedAt: data.invitedAt?.toDate() || new Date()
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for UserDeckReference
   */
  private convertUserDeckTimestamps(data: any): UserDeckReference {
    return {
      ...data,
      addedAt: data.addedAt?.toDate() || new Date(),
      lastAccessedAt: data.lastAccessedAt?.toDate() || new Date()
    };
  }
}
