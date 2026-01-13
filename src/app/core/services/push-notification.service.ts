import { Injectable, inject, signal, effect } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { Firestore, doc, setDoc, deleteDoc, collection, getDocs } from '@angular/fire/firestore';
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
  private deviceInfo = this.getDeviceInfo();
  private deviceId = this.getOrCreateDeviceId();
  private deviceFingerprint = this.deviceInfo.fingerprint;
  private messagingSwRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

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

    // Sync token automatically when user is logged in and permission is already granted
    effect(() => {
      const user = this.authService.currentUser();
      if (!user) return;
      if (!this.isSupported()) return;
      if (this.notificationPermission() !== 'granted') return;
      if (this.isUserDisabled()) return;
      this.syncTokenForUser(user.uid);
    });
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

  private ensureMessagingServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this.messagingSwRegistrationPromise) {
      return this.messagingSwRegistrationPromise;
    }

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return Promise.resolve(null);
    }

    if (!this.pwaDetection.isPWA()) {
      return Promise.resolve(null);
    }

    this.messagingSwRegistrationPromise = (async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const legacyRegistration = registrations.find(reg => {
          const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
          return scriptUrl.endsWith('/firebase-messaging-sw.js');
        });

        if (legacyRegistration) {
          await legacyRegistration.unregister();
        }

        const existing = registrations.find(reg => {
          const scriptUrl = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
          return reg.scope.endsWith('/firebase-messaging-sw/')
            || scriptUrl.endsWith('/firebase-messaging-sw/firebase-messaging-sw.js');
        });

        if (existing) {
          return existing;
        }

        return await navigator.serviceWorker.register(
          '/firebase-messaging-sw/firebase-messaging-sw.js',
          { scope: '/firebase-messaging-sw/' }
        );
      } catch (error) {
        console.warn('Failed to register Firebase Messaging service worker:', error);
        return null;
      }
    })();

    return this.messagingSwRegistrationPromise;
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

      const registration = await this.ensureMessagingServiceWorkerRegistration();
      if (!registration) {
        console.warn('⚠️ Messaging service worker not available; skipping FCM token request');
        return null;
      }

      const token = await getToken(this.messaging, {
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration
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
   * Stored at: users/{userId}/fcmTokens/{deviceId}
   */
  private async storeTokenInFirestore(token: string, userId: string): Promise<void> {
    try {
      const tokenDoc = doc(this.firestore, `users/${userId}/fcmTokens/${this.deviceId}`);

      await setDoc(tokenDoc, {
        token,
        deviceId: this.deviceId,
        deviceFingerprint: this.deviceFingerprint,
        createdAt: new Date(),
        updatedAt: new Date(),
        userAgent: this.deviceInfo.userAgent,
        platform: this.deviceInfo.platform
      }, { merge: true });

      console.log('✅ FCM token stored in Firestore');

      // Clean up duplicates for this device
      await this.cleanupDuplicateTokens(userId, token);
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
      // Remove current device token doc
      const deviceDoc = doc(this.firestore, `users/${currentUser.uid}/fcmTokens/${this.deviceId}`);
      await deleteDoc(deviceDoc);

      // Remove legacy token doc (old schema)
      if (token) {
        const legacyTokenDoc = doc(this.firestore, `users/${currentUser.uid}/fcmTokens/${token}`);
        await deleteDoc(legacyTokenDoc);
      }

      // Remove any other duplicates for this device
      await this.removeTokensForCurrentDevice(currentUser.uid, token || null);

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
   * Sync token if permission is already granted (no user interaction required)
   */
  private async syncTokenForUser(userId: string): Promise<void> {
    try {
      const token = await this.getFCMToken();
      if (token) {
        await this.storeTokenInFirestore(token, userId);
      }
    } catch (error) {
      console.error('Error syncing FCM token:', error);
    }
  }

  /**
   * Remove duplicate tokens for the current device.
   * Keeps the current device doc, removes older/legacy duplicates.
   */
  private async cleanupDuplicateTokens(userId: string, token: string): Promise<void> {
    try {
      const tokensSnapshot = await getDocs(collection(this.firestore, `users/${userId}/fcmTokens`));
      const deletions: Promise<void>[] = [];

      tokensSnapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        const isCurrentDoc = docSnap.id === this.deviceId;
        const sameDeviceId = data.deviceId && data.deviceId === this.deviceId;
        const sameFingerprint = data.deviceFingerprint && data.deviceFingerprint === this.deviceFingerprint;
        const sameLegacySignature = !data.deviceFingerprint
          && data.userAgent === this.deviceInfo.userAgent
          && data.platform === this.deviceInfo.platform;
        const sameToken = data.token === token;

        if (!isCurrentDoc && (sameDeviceId || sameFingerprint || sameLegacySignature || sameToken)) {
          deletions.push(deleteDoc(docSnap.ref));
        }
      });

      if (deletions.length > 0) {
        await Promise.all(deletions);
        console.log(`🧹 Cleaned up ${deletions.length} duplicate FCM tokens`);
      }
    } catch (error) {
      console.error('Error cleaning up duplicate tokens:', error);
    }
  }

  /**
   * Remove all tokens that match the current device fingerprint (opt-out for this device).
   */
  private async removeTokensForCurrentDevice(userId: string, token: string | null): Promise<void> {
    try {
      const tokensSnapshot = await getDocs(collection(this.firestore, `users/${userId}/fcmTokens`));
      const deletions: Promise<void>[] = [];

      tokensSnapshot.forEach(docSnap => {
        const data = docSnap.data() as any;
        const sameDeviceId = data.deviceId && data.deviceId === this.deviceId;
        const sameFingerprint = data.deviceFingerprint && data.deviceFingerprint === this.deviceFingerprint;
        const sameLegacySignature = !data.deviceFingerprint
          && data.userAgent === this.deviceInfo.userAgent
          && data.platform === this.deviceInfo.platform;
        const sameToken = token && data.token === token;

        if (sameDeviceId || sameFingerprint || sameLegacySignature || sameToken) {
          deletions.push(deleteDoc(docSnap.ref));
        }
      });

      if (deletions.length > 0) {
        await Promise.all(deletions);
        console.log(`🧹 Removed ${deletions.length} tokens for this device`);
      }
    } catch (error) {
      console.error('Error removing tokens for current device:', error);
    }
  }

  private getOrCreateDeviceId(): string {
    try {
      if (typeof window === 'undefined') {
        return 'server';
      }
      const key = 'fcm-device-id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;

      const newId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      localStorage.setItem(key, newId);
      return newId;
    } catch {
      return `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    }
  }

  private getDeviceInfo(): {
    userAgent: string;
    platform: string;
    language: string;
    screenWidth: number | null;
    screenHeight: number | null;
    devicePixelRatio: number | null;
    fingerprint: string;
  } {
    try {
      if (typeof window === 'undefined') {
        return {
          userAgent: '',
          platform: '',
          language: '',
          screenWidth: null,
          screenHeight: null,
          devicePixelRatio: null,
          fingerprint: 'server'
        };
      }
      const info = {
        userAgent: navigator.userAgent || '',
        platform: navigator.platform || '',
        language: navigator.language || '',
        screenWidth: typeof screen !== 'undefined' ? screen.width : null,
        screenHeight: typeof screen !== 'undefined' ? screen.height : null,
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : null
      };
      const parts = [
        info.userAgent,
        info.platform,
        info.language,
        String(info.screenWidth ?? ''),
        String(info.screenHeight ?? ''),
        String(info.devicePixelRatio ?? '')
      ];
      return {
        ...info,
        fingerprint: parts.join('|')
      };
    } catch {
      return {
        userAgent: '',
        platform: '',
        language: '',
        screenWidth: null,
        screenHeight: null,
        devicePixelRatio: null,
        fingerprint: 'unknown'
      };
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
