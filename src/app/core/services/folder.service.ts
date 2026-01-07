import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { Folder, FolderContentType } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class FolderService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Create a new folder for the user
   */
  async createFolder(
    userId: string,
    name: string,
    contentType: FolderContentType,
    color: string = '#6366f1',
    icon?: string
  ): Promise<string> {
    const foldersCol = collection(this.firestore, `users/${userId}/folders`);
    const folderRef = doc(foldersCol);
    const folderId = folderRef.id;

    // Get current max order
    const existingFolders = await this.getFoldersAsync(userId, contentType);
    const maxOrder = existingFolders.reduce((max, f) => Math.max(max, f.order), -1);

    const folderData: Omit<Folder, 'createdAt' | 'updatedAt'> & { createdAt: any; updatedAt: any } = {
      id: folderId,
      userId,
      name,
      color,
      contentType,
      order: maxOrder + 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(icon ? { icon } : {})
    };

    await setDoc(folderRef, folderData);
    return folderId;
  }

  /**
   * Update an existing folder
   */
  async updateFolder(
    userId: string,
    folderId: string,
    updates: Partial<Pick<Folder, 'name' | 'color' | 'icon'>>
  ): Promise<void> {
    const folderDoc = doc(this.firestore, `users/${userId}/folders/${folderId}`);
    await updateDoc(folderDoc, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Delete a folder (content items remain, just lose their folder assignment)
   */
  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const folderDoc = doc(this.firestore, `users/${userId}/folders/${folderId}`);
    await deleteDoc(folderDoc);
    // Note: Items in the folder will keep their folderId reference,
    // but filtering will just not match any folder.
    // Could optionally clear folderId from all items, but that requires
    // querying all userQuizzes/userDecks/userMaterials which is expensive.
  }

  /**
   * Get all folders for a user by content type
   */
  getFolders(userId: string, contentType: FolderContentType): Observable<Folder[]> {
    const foldersCol = collection(this.firestore, `users/${userId}/folders`);
    const q = query(
      foldersCol,
      where('contentType', '==', contentType),
      orderBy('order', 'asc')
    );

    return from(
      runInInjectionContext(this.injector, () => getDocs(q))
    ).pipe(
      map(snapshot => {
        return snapshot.docs.map(doc => this.convertTimestamps(doc.data() as any));
      })
    );
  }

  /**
   * Get all folders for a user by content type (async version)
   */
  async getFoldersAsync(userId: string, contentType: FolderContentType): Promise<Folder[]> {
    const foldersCol = collection(this.firestore, `users/${userId}/folders`);
    const q = query(
      foldersCol,
      where('contentType', '==', contentType),
      orderBy('order', 'asc')
    );

    const snapshot = await runInInjectionContext(this.injector, () => getDocs(q));
    return snapshot.docs.map(doc => this.convertTimestamps(doc.data() as any));
  }

  /**
   * Reorder folders
   */
  async reorderFolders(userId: string, folderIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);

    folderIds.forEach((folderId, index) => {
      const folderDoc = doc(this.firestore, `users/${userId}/folders/${folderId}`);
      batch.update(folderDoc, {
        order: index,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates
   */
  private convertTimestamps(data: any): Folder {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt || new Date(),
      updatedAt: data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate()
        : data.updatedAt || new Date()
    };
  }
}
