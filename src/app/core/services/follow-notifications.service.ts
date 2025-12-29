import { Injectable, inject, signal, effect, computed } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { FollowNotification } from '../../models';

@Injectable({
  providedIn: 'root'
})
export class FollowNotificationsService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  // Signals
  notifications = signal<FollowNotification[]>([]);
  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);
  isLoading = signal(false);

  private unsubscribe: (() => void) | null = null;
  private currentUserId: string | null = null;

  constructor() {
    // Auto-start listening when user is authenticated
    effect(() => {
      const user = this.authService.currentUser();
      const newUserId = user?.uid || null;

      // Only restart if user actually changed
      if (newUserId !== this.currentUserId) {
        this.stopListening();
        this.currentUserId = newUserId;

        if (newUserId) {
          this.startListening(newUserId);
        }
      }
    });
  }

  /**
   * Start real-time listening to follow notifications
   */
  startListening(userId: string): void {
    console.log('📡 Starting follow notifications listener...');
    this.isLoading.set(true);

    const notificationsRef = collection(this.firestore, 'followNotifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications: FollowNotification[] = snapshot.docs.map(doc => {
        const data = doc.data();
        // Support both new generic fields and legacy quiz-specific fields
        const contentType = data['contentType'] || 'quiz';
        const contentId = data['contentId'] || data['quizId'];
        const contentTitle = data['contentTitle'] || data['quizTitle'];

        return {
          id: doc.id,
          userId: data['userId'],
          authorId: data['authorId'],
          authorDisplayName: data['authorDisplayName'],
          authorPhotoURL: data['authorPhotoURL'],
          // Generic content fields
          contentType,
          contentId,
          contentTitle,
          // Legacy fields for backwards compatibility
          quizId: data['quizId'],
          quizTitle: data['quizTitle'],
          type: data['type'] || 'new-quiz',
          createdAt: data['createdAt'] instanceof Timestamp
            ? data['createdAt'].toDate()
            : new Date(data['createdAt']),
          read: data['read'] || false
        };
      });

      this.notifications.set(notifications);
      this.isLoading.set(false);
      console.log(`🔔 Loaded ${notifications.length} follow notifications`);
    }, (error) => {
      console.error('Error listening to follow notifications:', error);
      this.isLoading.set(false);
    });
  }

  /**
   * Stop listening to notifications
   */
  stopListening(): void {
    if (this.unsubscribe) {
      console.log('🛑 Stopping follow notifications listener');
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.notifications.set([]);
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(this.firestore, 'followNotifications', notificationId);
      await updateDoc(notificationRef, { read: true });

      // Optimistically update local state
      const updated = this.notifications().map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      this.notifications.set(updated);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    const unreadNotifications = this.notifications().filter(n => !n.read);
    if (unreadNotifications.length === 0) return;

    try {
      const batch = writeBatch(this.firestore);

      unreadNotifications.forEach(notification => {
        const notificationRef = doc(this.firestore, 'followNotifications', notification.id);
        batch.update(notificationRef, { read: true });
      });

      await batch.commit();

      // Optimistically update local state
      const updated = this.notifications().map(n => ({ ...n, read: true }));
      this.notifications.set(updated);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  /**
   * Delete a single notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      const notificationRef = doc(this.firestore, 'followNotifications', notificationId);
      await deleteDoc(notificationRef);

      // Optimistically update local state
      const filtered = this.notifications().filter(n => n.id !== notificationId);
      this.notifications.set(filtered);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  /**
   * Clear all notifications for the current user
   */
  async clearAll(): Promise<void> {
    const allNotifications = this.notifications();
    if (allNotifications.length === 0) return;

    try {
      const batch = writeBatch(this.firestore);

      allNotifications.forEach(notification => {
        const notificationRef = doc(this.firestore, 'followNotifications', notification.id);
        batch.delete(notificationRef);
      });

      await batch.commit();
      this.notifications.set([]);
    } catch (error) {
      console.error('Error clearing all notifications:', error);
    }
  }
}
