import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { OfflinePreloadService } from '../../core/services/offline-preload.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { PwaDetectionService } from '../../core/services/pwa-detection.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private pushNotification = inject(PushNotificationService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private networkStatus = inject(NetworkStatusService);
  private pwaDetection = inject(PwaDetectionService);
  private authService = inject(AuthService);

  // PWA Detection
  isPWA = this.pwaDetection.isPWA;

  // Notification state
  isSupported = this.pushNotification.isSupported;
  notificationPermission = this.pushNotification.notificationPermission;
  isEnabling = signal(false);
  isDisabling = signal(false);

  isNotificationsEnabled = computed(() => {
    return this.pushNotification.isEnabled();
  });

  canEnableNotifications = computed(() => {
    return this.isPWA() &&
           this.isSupported() &&
           !this.isNotificationsEnabled();
  });

  // Offline preload state
  isPreloading = this.offlinePreloadService.isPreloading;
  preloadProgress = this.offlinePreloadService.preloadProgress;
  isOnline = this.networkStatus.isOnline;
  preloadedQuizzes = this.offlinePreloadService.preloadedQuizzes;

  preloadedCount = computed(() => {
    let count = 0;
    this.preloadedQuizzes().forEach(status => {
      if (status.isPreloaded) count++;
    });
    return count;
  });

  totalQuizzesCount = computed(() => {
    return this.preloadedQuizzes().size;
  });

  async enableNotifications(): Promise<void> {
    this.isEnabling.set(true);

    try {
      const success = await this.pushNotification.requestPermission();

      if (success) {
        console.log('✅ Notifications enabled successfully');
      } else {
        console.log('❌ Failed to enable notifications');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
    } finally {
      this.isEnabling.set(false);
    }
  }

  async disableNotifications(): Promise<void> {
    this.isDisabling.set(true);

    try {
      await this.pushNotification.removeToken();
      console.log('✅ Notifications disabled successfully');
    } catch (error) {
      console.error('Error disabling notifications:', error);
    } finally {
      this.isDisabling.set(false);
    }
  }

  async preloadQuizzesForOffline(): Promise<void> {
    await this.offlinePreloadService.preloadAllQuizzes();
  }
}
