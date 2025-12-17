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
import { MaterialParticipant, UserMaterialReference } from '../../models';

type MaterialParticipantRole = 'owner' | 'co-author' | 'student';
type InvitationStatus = 'pending' | 'accepted';

@Injectable({
  providedIn: 'root'
})
export class MaterialParticipantService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Add a participant to a learning material
   */
  async addParticipant(
    materialId: string,
    userId: string,
    email: string,
    role: MaterialParticipantRole,
    invitedBy?: string,
    status: InvitationStatus = 'pending'
  ): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Add to materialParticipants collection
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const participantData: MaterialParticipant = {
      userId,
      email,
      role,
      invitedBy,
      invitedAt: Timestamp.now() as any,
      status
    };
    batch.set(participantDoc, participantData);

    // Add to user's userMaterials subcollection
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    const userMaterialData: UserMaterialReference = {
      materialId,
      role,
      addedAt: Timestamp.now() as any,
      lastAccessedAt: Timestamp.now() as any
    };
    batch.set(userMaterialDoc, userMaterialData);

    await batch.commit();
  }

  /**
   * Accept an invitation (change status from pending to accepted)
   */
  async acceptInvitation(materialId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    await updateDoc(participantDoc, {
      status: 'accepted'
    });
  }

  /**
   * Remove a participant from a material
   */
  async removeParticipant(materialId: string, userId: string): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Remove from materialParticipants
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    batch.delete(participantDoc);

    // Remove from user's userMaterials
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    batch.delete(userMaterialDoc);

    await batch.commit();
  }

  /**
   * Update participant role
   */
  async updateParticipantRole(materialId: string, userId: string, newRole: MaterialParticipantRole): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Update in materialParticipants
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    batch.update(participantDoc, { role: newRole });

    // Update in user's userMaterials
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    batch.update(userMaterialDoc, { role: newRole });

    await batch.commit();
  }

  /**
   * Get all participants for a material
   */
  getParticipantsByMaterialId(materialId: string): Observable<MaterialParticipant[]> {
    const participantsCol = collection(
      this.firestore,
      `materialParticipants/${materialId}/participants`
    ) as CollectionReference<MaterialParticipant>;

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
  getParticipant(materialId: string, userId: string): Observable<MaterialParticipant | null> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
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
  async getParticipantAsync(materialId: string, userId: string): Promise<MaterialParticipant | null> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as any;
    return this.convertTimestamps(data);
  }

  /**
   * Get all materials for a user (from userMaterials subcollection)
   */
  getUserMaterials(userId: string): Observable<UserMaterialReference[]> {
    const userMaterialsCol = collection(
      this.firestore,
      `users/${userId}/userMaterials`
    ) as CollectionReference<UserMaterialReference>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(userMaterialsCol))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertUserMaterialTimestamps(data);
        });
      })
    );
  }

  /**
   * Get materials by role for a user
   */
  getUserMaterialsByRole(userId: string, role: MaterialParticipantRole): Observable<UserMaterialReference[]> {
    const userMaterialsCol = collection(
      this.firestore,
      `users/${userId}/userMaterials`
    ) as CollectionReference<UserMaterialReference>;

    const q = query(userMaterialsCol, where('role', '==', role));

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return this.convertUserMaterialTimestamps(data);
        });
      })
    );
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(userId: string, materialId: string): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    await updateDoc(userMaterialDoc, {
      lastAccessedAt: Timestamp.now()
    });
  }

  /**
   * Check if user has a specific role for a material
   */
  async hasRole(materialId: string, userId: string, role: MaterialParticipantRole): Promise<boolean> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as MaterialParticipant;
    return data.role === role;
  }

  /**
   * Check if user can edit material (is owner or co-author)
   */
  async canEdit(materialId: string, userId: string): Promise<boolean> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));

    if (!docSnap.exists()) {
      return false;
    }

    const data = docSnap.data() as MaterialParticipant;
    return data.role === 'owner' || data.role === 'co-author';
  }

  /**
   * Delete all participants for a material (used when deleting a material)
   * Also removes userMaterials references from each user
   */
  async deleteAllParticipants(materialId: string): Promise<void> {
    const participantsCol = collection(
      this.firestore,
      `materialParticipants/${materialId}/participants`
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(participantsCol));

    if (snapshot.empty) {
      return;
    }

    const batch = writeBatch(this.firestore);

    snapshot.docs.forEach(participantDoc => {
      const data = participantDoc.data() as MaterialParticipant;

      // Delete from materialParticipants
      batch.delete(participantDoc.ref);

      // Delete from user's userMaterials
      const userMaterialDoc = doc(this.firestore, `users/${data.userId}/userMaterials/${materialId}`);
      batch.delete(userMaterialDoc);
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for MaterialParticipant
   */
  private convertTimestamps(data: any): MaterialParticipant {
    return {
      ...data,
      invitedAt: data.invitedAt?.toDate() || new Date()
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for UserMaterialReference
   */
  private convertUserMaterialTimestamps(data: any): UserMaterialReference {
    return {
      ...data,
      addedAt: data.addedAt?.toDate() || new Date(),
      lastAccessedAt: data.lastAccessedAt?.toDate() || new Date()
    };
  }
}
