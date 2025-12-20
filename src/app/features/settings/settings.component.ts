import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { OfflinePreloadService } from '../../core/services/offline-preload.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { PwaDetectionService } from '../../core/services/pwa-detection.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeSettingsComponent } from './components/theme-settings/theme-settings.component';
import { ColorThemeService } from '../../core/services/color-theme.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher.component';

const STORAGE_THEME_SETTINGS_EXPANDED = 'quiz-app-theme-settings-expanded';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, TranslateModule, ThemeSettingsComponent, LanguageSwitcherComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private pushNotification = inject(PushNotificationService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private networkStatus = inject(NetworkStatusService);
  private pwaDetection = inject(PwaDetectionService);
  private authService = inject(AuthService);
  private colorThemes = inject(ColorThemeService);
  private themeService = inject(ThemeService);

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
  preloadedDecks = this.offlinePreloadService.preloadedDecks;
  preloadedMaterials = this.offlinePreloadService.preloadedMaterials;

  preloadedQuizCount = computed(() => this.countPreloaded(this.preloadedQuizzes()));
  preloadedDeckCount = computed(() => this.countPreloaded(this.preloadedDecks()));
  preloadedMaterialCount = computed(() => this.countPreloaded(this.preloadedMaterials()));

  totalQuizzesCount = computed(() => this.preloadedQuizzes().size);
  totalDecksCount = computed(() => this.preloadedDecks().size);
  totalMaterialsCount = computed(() => this.preloadedMaterials().size);

  preloadedTotalCount = computed(() =>
    this.preloadedQuizCount() + this.preloadedDeckCount() + this.preloadedMaterialCount()
  );

  totalItemsCount = computed(() =>
    this.totalQuizzesCount() + this.totalDecksCount() + this.totalMaterialsCount()
  );

  // Theme (palette) section collapse state
  isThemeSettingsExpanded = signal(this.loadThemeSettingsExpanded());

  activeColorTheme = this.colorThemes.activeTheme;
  currentMode = this.themeService.theme;
  themePreviewGradient = computed(() => this.colorThemes.getPreviewGradient(this.activeColorTheme(), this.currentMode()));

  constructor() {
    effect(() => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_THEME_SETTINGS_EXPANDED, String(this.isThemeSettingsExpanded()));
    });
  }

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

  toggleThemeSettings(): void {
    this.isThemeSettingsExpanded.update((v) => !v);
  }

  private loadThemeSettingsExpanded(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(STORAGE_THEME_SETTINGS_EXPANDED);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return false;
  }

  private countPreloaded(map: Map<string, { isPreloaded: boolean }>): number {
    let count = 0;
    map.forEach(status => {
      if (status.isPreloaded) count++;
    });
    return count;
  }
}
