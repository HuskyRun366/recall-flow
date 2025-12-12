import { Injectable, inject, effect } from '@angular/core';
import { Firestore, collection, query, where, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { AuthService } from './auth.service';

// Extend Navigator interface for Badging API
declare global {
  interface Navigator {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  }
}

@Injectable({
  providedIn: 'root'
})
export class BadgingService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private unreadCount = 0;
  private unsubscribe: Unsubscribe | null = null;

  constructor() {
    // React to auth signal changes
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.startListening(user.uid);
      } else {
        this.stopListening();
        this.clearBadge();
      }
    });
  }

  // Check if Badging API is supported
  isSupported(): boolean {
    return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
  }

  // Set badge with count
  async setBadge(count?: number): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Badging API not supported');
      return;
    }

    try {
      if (count === undefined || count === 0) {
        await this.clearBadge();
      } else {
        await navigator.setAppBadge!(count);
        console.log(`📛 Badge set to ${count}`);
      }
    } catch (error) {
      console.error('Failed to set badge:', error);
    }
  }

  // Clear badge
  async clearBadge(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    try {
      await navigator.clearAppBadge!();
      console.log('📛 Badge cleared');
    } catch (error) {
      console.error('Failed to clear badge:', error);
    }
  }

  // Start listening for unread notifications
  private startListening(userId: string): void {
    if (!this.isSupported()) {
      return;
    }

    // Stop any existing listener
    this.stopListening();

    // Listen to notifications collection for unread notifications
    const notificationsRef = collection(this.firestore, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );

    this.unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        this.unreadCount = snapshot.size;
        this.setBadge(this.unreadCount);
        console.log(`📬 Unread notifications: ${this.unreadCount}`);
      },
      (error) => {
        console.error('Error listening to notifications:', error);
      }
    );
  }

  // Stop listening for notifications
  private stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // Get current unread count
  getUnreadCount(): number {
    return this.unreadCount;
  }

  // Manually increment badge
  async incrementBadge(): Promise<void> {
    this.unreadCount++;
    await this.setBadge(this.unreadCount);
  }

  // Manually decrement badge
  async decrementBadge(): Promise<void> {
    if (this.unreadCount > 0) {
      this.unreadCount--;
      await this.setBadge(this.unreadCount);
    }
  }

  // Reset badge to 0
  async resetBadge(): Promise<void> {
    this.unreadCount = 0;
    await this.clearBadge();
  }
}
