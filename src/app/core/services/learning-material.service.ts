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
  Timestamp
} from '@angular/fire/firestore';
import { LearningMaterial } from '../../models';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class LearningMaterialService {
  private readonly MATERIAL_COLLECTION = 'learningMaterials';
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  constructor() {}

  // Create a new learning material
  createMaterial(material: Omit<LearningMaterial, 'id' | 'createdAt' | 'updatedAt'>): Observable<string> {
    const materialRef = doc(collection(this.firestore, this.MATERIAL_COLLECTION));
    const materialId = materialRef.id;

    const materialData = {
      ...material,
      id: materialId,
      contentSize: material.contentSize || new Blob([material.htmlContent]).size,
      tags: material.tags || [],
      metadata: material.metadata || {
        totalStudents: 0,
        totalViews: 0
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    return from(setDoc(materialRef, materialData)).pipe(
      map(() => materialId)
    );
  }

  // Update an existing material
  updateMaterial(materialId: string, updates: Partial<LearningMaterial>): Observable<void> {
    const materialRef = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    // Recalculate content size if HTML content is updated
    if (updates.htmlContent) {
      (updateData as any).contentSize = new Blob([updates.htmlContent]).size;
    }

    delete (updateData as any).id;
    delete (updateData as any).createdAt;

    return from(updateDoc(materialRef, updateData));
  }

  // Delete a material
  deleteMaterial(materialId: string): Observable<void> {
    const materialRef = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);
    return from(deleteDoc(materialRef));
  }

  /**
   * Delete a material with complete cleanup of all related data.
   * Cleans up:
   * - Participants in materialParticipants/{materialId}
   * - User material references in users/{userId}/userMaterials/{materialId}
   */
  async deleteMaterialWithCleanup(
    materialId: string,
    participantService: { deleteAllParticipants: (materialId: string) => Promise<void> }
  ): Promise<void> {
    // Delete all participants first
    await participantService.deleteAllParticipants(materialId);

    // Then delete the material document itself
    const materialRef = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);
    await deleteDoc(materialRef);
  }

  // Get a single material by ID
  getMaterialById(materialId: string): Observable<LearningMaterial | null> {
    const materialRef = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);
    return from(
      runInInjectionContext(this.injector, () => getDoc(materialRef))
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
   * Get multiple materials by their IDs using individual document reads.
   */
  getMaterialsByIds(materialIds: string[]): Observable<LearningMaterial[]> {
    if (materialIds.length === 0) {
      return from(Promise.resolve([]));
    }

    const TIMEOUT_MS = 5000;

    const materialPromises = materialIds.map(async (materialId) => {
      try {
        const materialDoc = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout loading material ${materialId}`)), TIMEOUT_MS)
        );

        const docSnap = await Promise.race([
          getDoc(materialDoc),
          timeoutPromise
        ]);

        if (docSnap.exists()) {
          return this.convertTimestamps(docSnap.data() as any);
        } else {
          console.warn(`Material ${materialId} not found`);
          return null;
        }
      } catch (error: any) {
        console.error(`Failed to fetch material ${materialId}:`, error.message);
        return null;
      }
    });

    return from(Promise.allSettled(materialPromises)).pipe(
      map(results =>
        results
          .filter((result): result is PromiseFulfilledResult<LearningMaterial | null> =>
            result.status === 'fulfilled' && result.value !== null
          )
          .map(result => result.value as LearningMaterial)
      )
    );
  }

  // Get all materials owned by a user
  getMaterialsForUser(userId: string): Observable<LearningMaterial[]> {
    const materialsRef = collection(this.firestore, this.MATERIAL_COLLECTION);

    const ownedQuery = query(
      materialsRef,
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

  // Get public materials
  getPublicMaterials(): Observable<LearningMaterial[]> {
    const materialsRef = collection(this.firestore, this.MATERIAL_COLLECTION);
    const publicQuery = query(
      materialsRef,
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

  // Get material by join code
  getMaterialByJoinCode(joinCode: string): Observable<LearningMaterial | null> {
    const materialsRef = collection(this.firestore, this.MATERIAL_COLLECTION);
    const joinCodeQuery = query(
      materialsRef,
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
        return this.convertTimestamps(snapshot.docs[0].data() as any);
      })
    );
  }

  // Search materials by title or description
  searchMaterials(searchTerm: string): Observable<LearningMaterial[]> {
    const materialsRef = collection(this.firestore, this.MATERIAL_COLLECTION);
    const publicQuery = query(
      materialsRef,
      where('visibility', '==', 'public')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(publicQuery))
    ).pipe(
      map(snapshot => {
        const searchLower = searchTerm.toLowerCase();
        return snapshot.docs
          .map(doc => this.convertTimestamps(doc.data() as any))
          .filter(material =>
            material.title.toLowerCase().includes(searchLower) ||
            material.description.toLowerCase().includes(searchLower) ||
            material.tags.some(tag => tag.toLowerCase().includes(searchLower))
          );
      })
    );
  }

  // Update material metadata (student count, view count)
  updateMaterialMetadata(materialId: string, metadata: Partial<{ totalStudents: number; totalViews: number }>): Observable<void> {
    return this.getMaterialById(materialId).pipe(
      map(material => {
        if (!material) throw new Error('Material not found');

        const updatedMetadata = {
          ...material.metadata,
          ...metadata
        };

        return this.updateMaterial(materialId, { metadata: updatedMetadata });
      }),
      map(() => undefined)
    );
  }

  // Increment view count
  async incrementViewCount(materialId: string): Promise<void> {
    const materialRef = doc(this.firestore, `${this.MATERIAL_COLLECTION}/${materialId}`);
    const materialSnap = await getDoc(materialRef);

    if (materialSnap.exists()) {
      const currentViews = materialSnap.data()['metadata']?.totalViews || 0;

      await updateDoc(materialRef, {
        'metadata.totalViews': currentViews + 1,
        updatedAt: serverTimestamp()
      });
    }
  }

  // Generate join code for unlisted materials
  generateJoinCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = (len: number) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return `${part(4)}-${part(4)}`;
  }

  // Helper to convert Firestore timestamps to Date objects
  private convertTimestamps(data: any): LearningMaterial {
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
