import { Injectable, inject, Injector, runInInjectionContext, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  writeBatch,
  CollectionReference,
  increment,
  onSnapshot,
  Unsubscribe
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { FollowingEntry, FollowerEntry, User, FollowNotificationContentType, FollowNotificationType } from '../../models';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FollowService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private authService = inject(AuthService);

  // Cache for follow status checks
  private followingCache = signal<Map<string, boolean>>(new Map());

  // Real-time listeners
  private followingUnsubscribe: Unsubscribe | null = null;

  /**
   * Follow a user
   */
  async followUser(targetUserId: string): Promise<void> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      throw new Error('Must be authenticated to follow users');
    }

    if (currentUser.uid === targetUserId) {
      throw new Error('Cannot follow yourself');
    }

    // Check if already following
    const isAlreadyFollowing = await this.checkIsFollowing(currentUser.uid, targetUserId);
    if (isAlreadyFollowing) {
      return; // Already following, no action needed
    }

    // Get target user info for denormalization
    const targetUserDoc = doc(this.firestore, `users/${targetUserId}`);
    const targetUserSnap = await runInInjectionContext(this.injector, () => getDoc(targetUserDoc));
    if (!targetUserSnap.exists()) {
      throw new Error('User not found');
    }
    const targetUser = targetUserSnap.data() as User;

    const batch = writeBatch(this.firestore);

    // 1. Add to current user's following subcollection
    const followingDoc = doc(this.firestore, `users/${currentUser.uid}/following/${targetUserId}`);
    const followingData: FollowingEntry = {
      followedUserId: targetUserId,
      followedDisplayName: targetUser.displayName,
      followedPhotoURL: targetUser.photoURL,
      followedAt: Timestamp.now() as any
    };
    batch.set(followingDoc, this.stripUndefined(followingData));

    // 2. Add to target user's followers subcollection
    const followerDoc = doc(this.firestore, `users/${targetUserId}/followers/${currentUser.uid}`);
    const followerData: FollowerEntry = {
      followerId: currentUser.uid,
      followerDisplayName: currentUser.displayName,
      followerPhotoURL: currentUser.photoURL,
      followedAt: Timestamp.now() as any
    };
    batch.set(followerDoc, this.stripUndefined(followerData));

    // 3. Increment counts
    const currentUserDoc = doc(this.firestore, `users/${currentUser.uid}`);
    batch.update(currentUserDoc, { followingCount: increment(1) });
    batch.update(targetUserDoc, { followerCount: increment(1) });

    await batch.commit();

    // Update local cache
    const newCache = new Map(this.followingCache());
    newCache.set(targetUserId, true);
    this.followingCache.set(newCache);
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(targetUserId: string): Promise<void> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      throw new Error('Must be authenticated to unfollow users');
    }

    // Check if actually following
    const isFollowing = await this.checkIsFollowing(currentUser.uid, targetUserId);
    if (!isFollowing) {
      return; // Not following, no action needed
    }

    const batch = writeBatch(this.firestore);

    // 1. Remove from current user's following subcollection
    const followingDoc = doc(this.firestore, `users/${currentUser.uid}/following/${targetUserId}`);
    batch.delete(followingDoc);

    // 2. Remove from target user's followers subcollection
    const followerDoc = doc(this.firestore, `users/${targetUserId}/followers/${currentUser.uid}`);
    batch.delete(followerDoc);

    // 3. Decrement counts (with safety check)
    const currentUserDoc = doc(this.firestore, `users/${currentUser.uid}`);
    const targetUserDoc = doc(this.firestore, `users/${targetUserId}`);

    // Check current counts to avoid going negative
    const currentUserSnap = await runInInjectionContext(this.injector, () => getDoc(currentUserDoc));
    const targetUserSnap = await runInInjectionContext(this.injector, () => getDoc(targetUserDoc));

    if (currentUserSnap.exists()) {
      const followingCount = currentUserSnap.data()['followingCount'] || 0;
      if (followingCount > 0) {
        batch.update(currentUserDoc, { followingCount: increment(-1) });
      }
    }

    if (targetUserSnap.exists()) {
      const followerCount = targetUserSnap.data()['followerCount'] || 0;
      if (followerCount > 0) {
        batch.update(targetUserDoc, { followerCount: increment(-1) });
      }
    }

    await batch.commit();

    // Update local cache
    const newCache = new Map(this.followingCache());
    newCache.set(targetUserId, false);
    this.followingCache.set(newCache);
  }

  /**
   * Check if current user is following a specific user
   */
  async checkIsFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
    const followingDoc = doc(this.firestore, `users/${currentUserId}/following/${targetUserId}`);
    const docSnap = await runInInjectionContext(this.injector, () => getDoc(followingDoc));
    return docSnap.exists();
  }

  /**
   * Get follow status from cache or check
   */
  isFollowing(targetUserId: string): boolean {
    return this.followingCache().get(targetUserId) || false;
  }

  /**
   * Check and cache follow status
   */
  async checkAndCacheFollowStatus(targetUserId: string): Promise<boolean> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      return false;
    }

    const isFollowing = await this.checkIsFollowing(currentUser.uid, targetUserId);
    const newCache = new Map(this.followingCache());
    newCache.set(targetUserId, isFollowing);
    this.followingCache.set(newCache);
    return isFollowing;
  }

  /**
   * Get all users the current user is following
   */
  getFollowing(userId: string): Observable<FollowingEntry[]> {
    const followingCol = collection(
      this.firestore,
      `users/${userId}/following`
    ) as CollectionReference<FollowingEntry>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(followingCol))
    ).pipe(
      map(snapshot => snapshot.docs.map(doc => this.convertFollowingTimestamps(doc.data())))
    );
  }

  /**
   * Get all followers of a user
   */
  getFollowers(userId: string): Observable<FollowerEntry[]> {
    const followersCol = collection(
      this.firestore,
      `users/${userId}/followers`
    ) as CollectionReference<FollowerEntry>;

    return from(
      runInInjectionContext(this.injector, () => getDocs(followersCol))
    ).pipe(
      map(snapshot => snapshot.docs.map(doc => this.convertFollowerTimestamps(doc.data())))
    );
  }

  /**
   * Get follower count for a user
   */
  async getFollowerCount(userId: string): Promise<number> {
    const userDoc = doc(this.firestore, `users/${userId}`);
    const snap = await runInInjectionContext(this.injector, () => getDoc(userDoc));
    if (!snap.exists()) return 0;
    return snap.data()['followerCount'] || 0;
  }

  /**
   * Get following count for a user
   */
  async getFollowingCount(userId: string): Promise<number> {
    const userDoc = doc(this.firestore, `users/${userId}`);
    const snap = await runInInjectionContext(this.injector, () => getDoc(userDoc));
    if (!snap.exists()) return 0;
    return snap.data()['followingCount'] || 0;
  }

  /**
   * Get user profile with follow counts
   */
  async getUserProfile(userId: string): Promise<User | null> {
    const userDoc = doc(this.firestore, `users/${userId}`);
    const snap = await runInInjectionContext(this.injector, () => getDoc(userDoc));
    if (!snap.exists()) return null;

    const data = snap.data() as User;
    return {
      ...data,
      createdAt: (data.createdAt as any)?.toDate?.() || data.createdAt
    };
  }

  /**
   * Get all follower IDs for a user (used for sending notifications)
   */
  async getFollowerIds(userId: string): Promise<string[]> {
    const followersCol = collection(this.firestore, `users/${userId}/followers`);
    const snapshot = await runInInjectionContext(this.injector, () => getDocs(followersCol));
    return snapshot.docs.map(doc => doc.id);
  }

  /**
   * Generic method to notify all followers when a user publishes or updates content.
   * Creates a notification document for each follower.
   * Uses batches of 500 (Firestore limit) for large follower counts.
   */
  async notifyFollowersOfContent(
    contentId: string,
    contentTitle: string,
    contentType: FollowNotificationContentType,
    authorId: string,
    isUpdate: boolean = false
  ): Promise<void> {
    const currentUser = this.authService.currentUser();
    if (!currentUser) return;

    // Get all follower IDs
    const followerIds = await this.getFollowerIds(authorId);
    if (followerIds.length === 0) return;

    const authorName = currentUser.displayName || 'Unknown';
    const notificationsCol = collection(this.firestore, 'followNotifications');

    // Map content type to notification type
    const newTypeMap: Record<FollowNotificationContentType, FollowNotificationType> = {
      'quiz': 'new-quiz',
      'flashcardDeck': 'new-flashcard-deck',
      'learningMaterial': 'new-material'
    };

    const updateTypeMap: Record<FollowNotificationContentType, FollowNotificationType> = {
      'quiz': 'updated-quiz',
      'flashcardDeck': 'updated-flashcard-deck',
      'learningMaterial': 'updated-material'
    };

    const notificationType = isUpdate ? updateTypeMap[contentType] : newTypeMap[contentType];

    // Batch in groups of 500 (Firestore limit)
    const BATCH_SIZE = 500;
    for (let i = 0; i < followerIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(this.firestore);
      const chunk = followerIds.slice(i, i + BATCH_SIZE);

      for (const followerId of chunk) {
        const notificationDoc = doc(notificationsCol);
        batch.set(notificationDoc, {
          userId: followerId,
          authorId: authorId,
          authorDisplayName: authorName,
          authorPhotoURL: currentUser.photoURL || null,
          // Generic fields
          contentType: contentType,
          contentId: contentId,
          contentTitle: contentTitle,
          // Legacy fields for backwards compatibility
          quizId: contentType === 'quiz' ? contentId : null,
          quizTitle: contentType === 'quiz' ? contentTitle : null,
          type: notificationType,
          createdAt: Timestamp.now(),
          read: false,
          pushSent: false  // Allows notification server to track which notifications have been pushed
        });
      }

      await batch.commit();
    }

    // Wake up the notification server to process the new notifications
    // This is non-blocking and best-effort
    this.wakeNotificationServer();
  }

  /**
   * Notify followers of a new quiz (convenience method)
   */
  async notifyFollowers(quizId: string, quizTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(quizId, quizTitle, 'quiz', authorId, false);
  }

  /**
   * Notify followers of an updated quiz
   */
  async notifyFollowersOfQuizUpdate(quizId: string, quizTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(quizId, quizTitle, 'quiz', authorId, true);
  }

  /**
   * Notify followers of a new flashcard deck
   */
  async notifyFollowersOfFlashcardDeck(deckId: string, deckTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(deckId, deckTitle, 'flashcardDeck', authorId, false);
  }

  /**
   * Notify followers of an updated flashcard deck
   */
  async notifyFollowersOfFlashcardDeckUpdate(deckId: string, deckTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(deckId, deckTitle, 'flashcardDeck', authorId, true);
  }

  /**
   * Notify followers of new learning material
   */
  async notifyFollowersOfMaterial(materialId: string, materialTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(materialId, materialTitle, 'learningMaterial', authorId, false);
  }

  /**
   * Notify followers of updated learning material
   */
  async notifyFollowersOfMaterialUpdate(materialId: string, materialTitle: string, authorId: string): Promise<void> {
    return this.notifyFollowersOfContent(materialId, materialTitle, 'learningMaterial', authorId, true);
  }

  /**
   * Start listening to current user's following list for cache updates
   */
  startFollowingListener(userId: string): void {
    this.stopFollowingListener();

    const followingCol = collection(this.firestore, `users/${userId}/following`);
    this.followingUnsubscribe = onSnapshot(followingCol, (snapshot) => {
      const newCache = new Map<string, boolean>();
      snapshot.docs.forEach(doc => {
        newCache.set(doc.id, true);
      });
      this.followingCache.set(newCache);
    });
  }

  /**
   * Stop listening to following list
   */
  stopFollowingListener(): void {
    if (this.followingUnsubscribe) {
      this.followingUnsubscribe();
      this.followingUnsubscribe = null;
    }
  }

  /**
   * Clear follow cache (e.g., on logout)
   */
  clearCache(): void {
    this.followingCache.set(new Map());
    this.stopFollowingListener();
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for FollowingEntry
   */
  private convertFollowingTimestamps(data: any): FollowingEntry {
    return {
      ...data,
      followedAt: data.followedAt?.toDate?.() || data.followedAt || new Date()
    };
  }

  /**
   * Convert Firestore Timestamps to JavaScript Dates for FollowerEntry
   */
  private convertFollowerTimestamps(data: any): FollowerEntry {
    return {
      ...data,
      followedAt: data.followedAt?.toDate?.() || data.followedAt || new Date()
    };
  }

  /**
   * Remove undefined values from object (Firestore doesn't accept undefined)
   */
  private stripUndefined(obj: any): any {
    const result: any = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    });
    return result;
  }

  /**
   * Wake up the notification server on Render.com free tier.
   * This is called after creating notifications to ensure the server
   * is awake and can process push notifications via Firestore listeners.
   */
  private async wakeNotificationServer(): Promise<void> {
    const serverConfig = (environment as any).notificationServer;

    // Skip if not configured or disabled
    if (!serverConfig?.enabled || !serverConfig?.url) {
      return;
    }

    try {
      const baseUrl = String(serverConfig.url).replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/api/wake`, { method: 'GET' });

      if (response.ok) {
        console.log('✅ Notification server woken up successfully');
      } else {
        console.warn('⚠️ Failed to wake notification server:', response.status);
      }
    } catch (error) {
      // Don't throw - this is a best-effort wake call
      // The server might already be awake or temporarily unavailable
      console.warn('⚠️ Could not reach notification server:', error);
    }
  }
}
