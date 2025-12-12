import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc
} from '@angular/fire/firestore';
import { UserEmailLookup, sanitizeEmailForDocId } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class UserLookupService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /**
   * Create or update email lookup entry
   */
  async createEmailLookup(userId: string, email: string): Promise<void> {
    const sanitizedEmail = sanitizeEmailForDocId(email);
    const lookupDoc = doc(this.firestore, `usersByEmail/${sanitizedEmail}`);

    const lookupData: UserEmailLookup = {
      userId,
      email
    };

    await setDoc(lookupDoc, lookupData);
  }

  /**
   * Get userId by email address
   * Returns null if email is not found
   */
  async getUserIdByEmail(email: string): Promise<string | null> {
    const sanitizedEmail = sanitizeEmailForDocId(email);
    const lookupDoc = doc(this.firestore, `usersByEmail/${sanitizedEmail}`);

    const docSnap = await runInInjectionContext(this.injector, () => getDoc(lookupDoc));

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as UserEmailLookup;
    return data.userId;
  }

  /**
   * Delete email lookup entry
   * Used when user account is deleted
   */
  async deleteEmailLookup(email: string): Promise<void> {
    const sanitizedEmail = sanitizeEmailForDocId(email);
    const lookupDoc = doc(this.firestore, `usersByEmail/${sanitizedEmail}`);
    await deleteDoc(lookupDoc);
  }

  /**
   * Update email lookup when user changes email
   */
  async updateEmailLookup(oldEmail: string, newEmail: string, userId: string): Promise<void> {
    // Delete old lookup
    await this.deleteEmailLookup(oldEmail);

    // Create new lookup
    await this.createEmailLookup(userId, newEmail);
  }
}
