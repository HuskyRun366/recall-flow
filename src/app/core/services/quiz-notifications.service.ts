import { Injectable, inject, signal, effect } from '@angular/core';
import { Firestore, collection, query, where, onSnapshot, Timestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { ParticipantService } from './participant.service';

export interface QuizNotification {
  id: string;
  quizId: string;
  quizTitle: string;
  type: 'quiz-updated' | 'question-added' | 'question-deleted';
  message: string;
  timestamp: Date;
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class QuizNotificationsService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private participantService = inject(ParticipantService);

  // Signals
  notifications = signal<QuizNotification[]>([]);
  unreadCount = signal(0);

  private unsubscribers: (() => void)[] = [];
  private watchedQuizzes = new Set<string>();
  private quizLastUpdated = new Map<string, Date>();
  private currentUserId: string | null = null;

  constructor() {
    // Auto-start listening when user is authenticated
    effect(() => {
      const user = this.authService.currentUser();
      const newUserId = user?.uid || null;

      // Only start listening if user actually changed (prevents listener proliferation)
      if (newUserId !== this.currentUserId) {
        this.stopListening();  // Clean up old listeners first
        this.currentUserId = newUserId;

        if (newUserId) {
          this.startListening(newUserId);
        }
      }
    });
  }

  /**
   * Start listening to quiz changes for all quizzes where user is owner/co-author
   */
  async startListening(userId: string): Promise<void> {
    console.log('📡 Starting quiz change notifications...');

    // Get all quizzes where user is owner or co-author
    const userQuizzesRef = collection(this.firestore, `users/${userId}/userQuizzes`);

    const unsubscribe = onSnapshot(userQuizzesRef, async (snapshot) => {
      // Get quiz IDs and roles
      const quizRoles = new Map<string, string>();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        quizRoles.set(doc.id, data['role']);
      });

      // Only watch quizzes where user is owner or co-author
      const watchableQuizIds = Array.from(quizRoles.entries())
        .filter(([_, role]) => role === 'owner' || role === 'co-author')
        .map(([quizId]) => quizId);

      // Start watching new quizzes
      for (const quizId of watchableQuizIds) {
        if (!this.watchedQuizzes.has(quizId)) {
          this.watchQuiz(quizId);
        }
      }

      // Stop watching removed quizzes
      for (const watchedQuizId of this.watchedQuizzes) {
        if (!watchableQuizIds.includes(watchedQuizId)) {
          this.unwatchQuiz(watchedQuizId);
        }
      }
    });

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Watch a specific quiz for changes
   */
  private watchQuiz(quizId: string): void {
    console.log(`👀 Watching quiz ${quizId} for changes`);
    this.watchedQuizzes.add(quizId);

    const quizRef = doc(this.firestore, `quizzes/${quizId}`);

    const unsubscribe = onSnapshot(quizRef, (snapshot) => {
      if (!snapshot.exists()) {
        this.unwatchQuiz(quizId);
        return;
      }

      const data = snapshot.data();
      const updatedAt = data['updatedAt'];
      const title = data['title'] || 'Unbenanntes Quiz';

      // Convert Firestore Timestamp to Date
      const updateDate = updatedAt instanceof Timestamp
        ? updatedAt.toDate()
        : new Date(updatedAt);

      // Check if this is a real update (not initial load)
      const lastUpdate = this.quizLastUpdated.get(quizId);
      if (lastUpdate && updateDate > lastUpdate) {
        // Real update detected!
        this.addNotification({
          id: `${quizId}-${Date.now()}`,
          quizId,
          quizTitle: title,
          type: 'quiz-updated',
          message: `"${title}" wurde aktualisiert`,
          timestamp: updateDate,
          read: false
        });

        console.log(`🔔 Quiz updated: ${title}`);
      }

      // Update last known update time
      this.quizLastUpdated.set(quizId, updateDate);
    });

    this.unsubscribers.push(unsubscribe);

    // Also watch questions for this quiz
    this.watchQuestions(quizId);
  }

  /**
   * Watch questions for a specific quiz
   */
  private watchQuestions(quizId: string): void {
    const questionsRef = collection(this.firestore, 'questions');
    const q = query(questionsRef, where('quizId', '==', quizId));

    let initialLoad = true;
    let previousQuestionCount = 0;

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const currentCount = snapshot.size;

      // Get quiz title for notification
      const quizRef = doc(this.firestore, `quizzes/${quizId}`);
      const quizSnap = await getDoc(quizRef);
      const quizTitle = quizSnap.exists() ? quizSnap.data()?.['title'] || 'Quiz' : 'Quiz';

      if (initialLoad) {
        previousQuestionCount = currentCount;
        initialLoad = false;
        return;
      }

      // Question added
      if (currentCount > previousQuestionCount) {
        const diff = currentCount - previousQuestionCount;
        this.addNotification({
          id: `${quizId}-question-${Date.now()}`,
          quizId,
          quizTitle,
          type: 'question-added',
          message: `${diff} Frage${diff > 1 ? 'n' : ''} zu "${quizTitle}" hinzugefügt`,
          timestamp: new Date(),
          read: false
        });
        console.log(`🔔 Questions added to ${quizTitle}: +${diff}`);
      }

      // Question deleted
      if (currentCount < previousQuestionCount) {
        const diff = previousQuestionCount - currentCount;
        this.addNotification({
          id: `${quizId}-question-del-${Date.now()}`,
          quizId,
          quizTitle,
          type: 'question-deleted',
          message: `${diff} Frage${diff > 1 ? 'n' : ''} aus "${quizTitle}" entfernt`,
          timestamp: new Date(),
          read: false
        });
        console.log(`🔔 Questions deleted from ${quizTitle}: -${diff}`);
      }

      previousQuestionCount = currentCount;
    });

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Stop watching a specific quiz
   */
  private unwatchQuiz(quizId: string): void {
    console.log(`👋 Stopped watching quiz ${quizId}`);
    this.watchedQuizzes.delete(quizId);
    this.quizLastUpdated.delete(quizId);
  }

  /**
   * Stop all listeners
   */
  private stopListening(): void {
    console.log('🛑 Stopping all quiz change notifications');

    // Unsubscribe all listeners with error handling
    this.unsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Error unsubscribing listener:', error);
      }
    });
    this.unsubscribers = [];

    // Clear all tracking data
    this.watchedQuizzes.clear();
    this.quizLastUpdated.clear();

    // Reset signals
    this.notifications.set([]);
    this.unreadCount.set(0);
  }

  /**
   * Add a notification
   */
  private addNotification(notification: QuizNotification): void {
    const current = this.notifications();
    this.notifications.set([notification, ...current]);
    this.updateUnreadCount();
  }

  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: string): void {
    const updated = this.notifications().map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    this.notifications.set(updated);
    this.updateUnreadCount();
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    const updated = this.notifications().map(n => ({ ...n, read: true }));
    this.notifications.set(updated);
    this.updateUnreadCount();
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notifications.set([]);
    this.unreadCount.set(0);
  }

  /**
   * Clear a specific notification
   */
  clearNotification(notificationId: string): void {
    const filtered = this.notifications().filter(n => n.id !== notificationId);
    this.notifications.set(filtered);
    this.updateUnreadCount();
  }

  /**
   * Update unread count
   */
  private updateUnreadCount(): void {
    const count = this.notifications().filter(n => !n.read).length;
    this.unreadCount.set(count);
  }
}
