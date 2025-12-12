import { Injectable, inject, signal } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { Firestore, doc, setDoc, deleteDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { PwaDetectionService } from './pwa-detection.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private messaging = inject(Messaging);
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private pwaDetection = inject(PwaDetectionService);

  // Signals
  notificationPermission = signal<NotificationPermission>('default');
  isSupported = signal<boolean>(false);
  fcmToken = signal<string | null>(null);
  isUserDisabled = signal<boolean>(false); // Track if user explicitly disabled notifications

  constructor() {
    this.checkSupport();
    this.checkPermission();
    this.loadUserPreference();
    this.listenForMessages();
  }

  /**
   * Check if push notifications are supported
   * Only supported in PWA mode
   */
  private checkSupport(): void {
    const isPWA = this.pwaDetection.isPWA();
    const hasNotificationAPI = 'Notification' in window;
    const hasServiceWorker = 'serviceWorker' in navigator;

    this.isSupported.set(isPWA && hasNotificationAPI && hasServiceWorker);

    if (!isPWA) {
      console.log('📱 Push notifications are only available in PWA mode');
    }
  }

  /**
   * Check current notification permission
   */
  private checkPermission(): void {
    if ('Notification' in window) {
      this.notificationPermission.set(Notification.permission);
    }
  }

  /**
   * Load user's notification preference from localStorage
   */
  private loadUserPreference(): void {
    const disabled = localStorage.getItem('notifications-disabled');
    this.isUserDisabled.set(disabled === 'true');
  }

  /**
   * Request notification permission
   * MUST be called from a user action (button click)
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('⚠️ Push notifications not supported');
      return false;
    }

    const currentUser = this.authService.currentUser();
    if (!currentUser) {
      console.warn('⚠️ User not authenticated');
      return false;
    }

    try {
      // Request permission - MUST be triggered by user action
      const permission = await Notification.requestPermission();
      this.notificationPermission.set(permission);

      if (permission === 'granted') {
        console.log('✅ Notification permission granted');

        // Clear the user-disabled flag
        this.isUserDisabled.set(false);
        localStorage.removeItem('notifications-disabled');

        // Get FCM token
        const token = await this.getFCMToken();

        if (token) {
          // Store token in Firestore
          await this.storeTokenInFirestore(token, currentUser.uid);
          return true;
        }
      } else {
        console.log('❌ Notification permission denied');
      }

      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Get FCM token for this device
   */
  private async getFCMToken(): Promise<string | null> {
    try {
      // Check if VAPID key is configured
      const vapidKey = (environment.firebase as any).vapidKey;
      if (!vapidKey || vapidKey === 'YOUR_VAPID_KEY') {
        console.error('❌ VAPID Key not configured! Please add vapidKey to environment.firebase');
        console.error('📖 See PUSH_NOTIFICATIONS_SETUP.md for instructions');
        return null;
      }

      const token = await getToken(this.messaging, {
        vapidKey: vapidKey
      });

      if (token) {
        console.log('🔑 FCM Token:', token);
        this.fcmToken.set(token);
        return token;
      } else {
        console.warn('⚠️ No FCM token available');
        return null;
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
      return null;
    }
  }

  /**
   * Store FCM token in Firestore
   * Stored at: users/{userId}/fcmTokens/{token}
   */
  private async storeTokenInFirestore(token: string, userId: string): Promise<void> {
    try {
      const tokenDoc = doc(this.firestore, `users/${userId}/fcmTokens/${token}`);

      await setDoc(tokenDoc, {
        token,
        createdAt: new Date(),
        userAgent: navigator.userAgent,
        platform: navigator.platform
      });

      console.log('✅ FCM token stored in Firestore');
    } catch (error) {
      console.error('Error storing FCM token:', error);
    }
  }

  /**
   * Remove FCM token from Firestore and disable notifications
   * Note: Browser permission stays "granted" but we mark it as user-disabled
   */
  async removeToken(): Promise<void> {
    const currentUser = this.authService.currentUser();
    const token = this.fcmToken();

    if (!currentUser || !token) {
      // Even without a token, mark as disabled
      this.isUserDisabled.set(true);
      localStorage.setItem('notifications-disabled', 'true');
      return;
    }

    try {
      const tokenDoc = doc(this.firestore, `users/${currentUser.uid}/fcmTokens/${token}`);
      await deleteDoc(tokenDoc);

      this.fcmToken.set(null);

      // Mark as user-disabled so UI updates
      this.isUserDisabled.set(true);
      localStorage.setItem('notifications-disabled', 'true');

      console.log('✅ FCM token removed and notifications disabled');
    } catch (error) {
      console.error('Error removing FCM token:', error);
      throw error;
    }
  }

  /**
   * Listen for foreground messages
   */
  private listenForMessages(): void {
    onMessage(this.messaging, (payload) => {
      console.log('📬 Message received:', payload);

      // Show notification if permission granted
      if (this.notificationPermission() === 'granted') {
        this.showNotification(
          payload.notification?.title || 'New notification',
          payload.notification?.body || '',
          payload.notification?.icon
        );
      }
    });
  }

  /**
   * Show a local notification
   */
  private showNotification(title: string, body: string, icon?: string): void {
    if ('serviceWorker' in navigator && this.notificationPermission() === 'granted') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          body,
          icon: icon || '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/icon-72x72.png',
          tag: 'quiz-notification',
          requireInteraction: false
        });
      });
    }
  }

  /**
   * Check if user has granted notification permission AND hasn't disabled them
   */
  hasPermission(): boolean {
    return this.notificationPermission() === 'granted' && !this.isUserDisabled();
  }

  /**
   * Check if notifications are effectively enabled
   * (Permission granted AND not user-disabled)
   */
  isEnabled(): boolean {
    return this.notificationPermission() === 'granted' && !this.isUserDisabled();
  }

  /**
   * Check if user can request notifications
   * (PWA mode + not denied)
   */
  canRequestPermission(): boolean {
    return this.isSupported() && this.notificationPermission() !== 'denied';
  }
}
