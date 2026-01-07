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
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    const existing = existingSnap.exists() ? (existingSnap.data() as MaterialParticipant) : null;
    const shouldIncrement =
      this.shouldCountInTotals(role, status) &&
      !this.shouldCountInTotals(existing?.role, existing?.status);

    const batch = writeBatch(this.firestore);

    // Add to materialParticipants collection
    const participantData: MaterialParticipant = {
      userId,
      email,
      role,
      invitedAt: Timestamp.now() as any,
      status,
      ...(invitedBy ? { invitedBy } : {})
    };
    batch.set(participantDoc, participantData);

    // Add to user's userMaterials subcollection
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    const userMaterialData: UserMaterialReference = {
      materialId,
      role,
      addedAt: Timestamp.now() as any,
      lastAccessedAt: Timestamp.now() as any,
      tags: [],
      isFavorite: false
    };
    batch.set(userMaterialDoc, userMaterialData);

    await batch.commit();

    if (shouldIncrement) {
      await this.updateStudentCount(materialId, 1);
    }
  }

  /**
   * Accept an invitation (change status from pending to accepted)
   */
  async acceptInvitation(materialId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    if (!existingSnap.exists()) return;

    const existing = existingSnap.data() as MaterialParticipant;
    if (existing.status === 'accepted') return;

    await updateDoc(participantDoc, { status: 'accepted' });

    if (this.shouldCountInTotals(existing.role, 'accepted')) {
      await this.updateStudentCount(materialId, 1);
    }
  }

  /**
   * Remove a participant from a material
   */
  async removeParticipant(materialId: string, userId: string): Promise<void> {
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    const existing = existingSnap.exists() ? (existingSnap.data() as MaterialParticipant) : null;
    const shouldDecrement = this.shouldCountInTotals(existing?.role, existing?.status);

    const batch = writeBatch(this.firestore);

    if (shouldDecrement) {
      const currentCount = await this.getCurrentStudentCount(materialId);
      if (currentCount > 0) {
        batch.update(doc(this.firestore, `learningMaterials/${materialId}`), {
          'metadata.totalStudents': increment(-1)
        });
      }
    }

    // Remove from materialParticipants
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
    const participantDoc = doc(this.firestore, `materialParticipants/${materialId}/participants/${userId}`);
    const existingSnap = await runInInjectionContext(this.injector, () => getDoc(participantDoc));
    if (!existingSnap.exists()) return;

    const existing = existingSnap.data() as MaterialParticipant;
    if (existing.role === newRole) return;

    const wasCounted = this.shouldCountInTotals(existing.role, existing.status);
    const willCount = this.shouldCountInTotals(newRole, existing.status);
    const delta = willCount && !wasCounted ? 1 : (!willCount && wasCounted ? -1 : 0);

    const batch = writeBatch(this.firestore);

    // Update in materialParticipants
    batch.update(participantDoc, { role: newRole });

    // Update in user's userMaterials
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    batch.update(userMaterialDoc, { role: newRole });

    if (delta !== 0) {
      if (delta < 0) {
        const currentCount = await this.getCurrentStudentCount(materialId);
        if (currentCount > 0) {
          batch.update(doc(this.firestore, `learningMaterials/${materialId}`), {
            'metadata.totalStudents': increment(delta)
          });
        }
      } else {
        batch.update(doc(this.firestore, `learningMaterials/${materialId}`), {
          'metadata.totalStudents': increment(delta)
        });
      }
    }

    await batch.commit();
  }

  private shouldCountInTotals(role?: MaterialParticipantRole, status?: InvitationStatus): boolean {
    return role === 'student' && status === 'accepted';
  }

  private async updateStudentCount(materialId: string, delta: number): Promise<void> {
    if (!materialId || !Number.isFinite(delta) || delta === 0) return;
    try {
      await updateDoc(doc(this.firestore, `learningMaterials/${materialId}`), {
        'metadata.totalStudents': increment(delta)
      });
    } catch (error) {
      console.warn('Failed to update material student count:', error);
    }
  }

  private async getCurrentStudentCount(materialId: string): Promise<number> {
    try {
      const materialDoc = doc(this.firestore, `learningMaterials/${materialId}`);
      const snap = await runInInjectionContext(this.injector, () => getDoc(materialDoc));
      if (!snap.exists()) return 0;
      const raw = snap.data()?.['metadata']?.['totalStudents'];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    } catch (error) {
      console.warn('Failed to read material student count:', error);
      return 0;
    }
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
      lastAccessedAt: data.lastAccessedAt?.toDate() || new Date(),
      tags: data.tags || [],
      isFavorite: data.isFavorite || false
    };
  }

  // ===== Organization Methods =====

  /**
   * Set favorite status for a material
   */
  async setFavorite(userId: string, materialId: string, isFavorite: boolean): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    await updateDoc(userMaterialDoc, { isFavorite });
  }

  /**
   * Set folder for a material
   */
  async setFolder(userId: string, materialId: string, folderId: string | null): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    if (folderId === null) {
      await updateDoc(userMaterialDoc, { folderId: deleteField() });
    } else {
      await updateDoc(userMaterialDoc, { folderId });
    }
  }

  /**
   * Set tags for a material (replaces all tags)
   */
  async setTags(userId: string, materialId: string, tags: string[]): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    await updateDoc(userMaterialDoc, { tags });
  }

  /**
   * Add a tag to a material
   */
  async addTag(userId: string, materialId: string, tag: string): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(userMaterialDoc));
    if (!docSnap.exists()) return;

    const data = docSnap.data() as UserMaterialReference;
    const currentTags = data.tags || [];
    if (!currentTags.includes(tag)) {
      await updateDoc(userMaterialDoc, { tags: [...currentTags, tag] });
    }
  }

  /**
   * Remove a tag from a material
   */
  async removeTag(userId: string, materialId: string, tag: string): Promise<void> {
    const userMaterialDoc = doc(this.firestore, `users/${userId}/userMaterials/${materialId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(userMaterialDoc));
    if (!docSnap.exists()) return;

    const data = docSnap.data() as UserMaterialReference;
    const currentTags = data.tags || [];
    await updateDoc(userMaterialDoc, { tags: currentTags.filter(t => t !== tag) });
  }

  /**
   * Get all favorite materials for a user
   */
  getFavoriteMaterials(userId: string): Observable<UserMaterialReference[]> {
    const userMaterialsCol = collection(
      this.firestore,
      `users/${userId}/userMaterials`
    ) as CollectionReference<UserMaterialReference>;

    const q = query(userMaterialsCol, where('isFavorite', '==', true));

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
   * Get materials by folder for a user
   */
  getMaterialsByFolder(userId: string, folderId: string): Observable<UserMaterialReference[]> {
    const userMaterialsCol = collection(
      this.firestore,
      `users/${userId}/userMaterials`
    ) as CollectionReference<UserMaterialReference>;

    const q = query(userMaterialsCol, where('folderId', '==', folderId));

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
}
