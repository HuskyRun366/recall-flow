import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PushNotificationService } from '../../../core/services/push-notification.service';
import { PwaDetectionService } from '../../../core/services/pwa-detection.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './notification-settings.component.html',
  styleUrls: ['./notification-settings.component.scss']
})
export class NotificationSettingsComponent {
  private pushNotification = inject(PushNotificationService);
  private pwaDetection = inject(PwaDetectionService);
  private authService = inject(AuthService);

  isPWA = this.pwaDetection.isPWA;
  isSupported = this.pushNotification.isSupported;
  notificationPermission = this.pushNotification.notificationPermission;
  isEnabling = signal(false);

  // Show notification card if:
  // 1. Running in PWA
  // 2. Notifications are supported
  // 3. Permission not granted yet
  // 4. Permission not denied
  showNotificationCard = computed(() => {
    return this.isPWA() &&
           this.isSupported() &&
           this.notificationPermission() !== 'granted' &&
           this.notificationPermission() !== 'denied';
  });

  // Show enabled state
  isEnabled = computed(() => {
    return this.notificationPermission() === 'granted';
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
    await this.pushNotification.removeToken();
  }
}
