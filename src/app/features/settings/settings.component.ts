import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PushNotificationService } from '../../core/services/push-notification.service';
import { OfflinePreloadService } from '../../core/services/offline-preload.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { PwaDetectionService } from '../../core/services/pwa-detection.service';
import { AuthService } from '../../core/services/auth.service';
import { ThemeSettingsComponent } from './components/theme-settings/theme-settings.component';
import { ColorThemeService } from '../../core/services/color-theme.service';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageSwitcherComponent } from '../../shared/components/language-switcher/language-switcher.component';
import { ToastService } from '../../core/services/toast.service';
import { AccessibilityService } from '../../core/services/accessibility.service';
import { AccountDataService } from '../../core/services/account-data.service';
import { ConsentService } from '../../core/services/consent.service';
import { environment } from '../../../environments/environment';

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
  private toastService = inject(ToastService);
  private colorThemes = inject(ColorThemeService);
  private themeService = inject(ThemeService);
  private translate = inject(TranslateService);
  private accessibility = inject(AccessibilityService);
  private accountData = inject(AccountDataService);
  private consentService = inject(ConsentService);

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
  isResettingCache = signal(false);

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
  private lastRefreshUserId = signal<string | null>(null);

  activeColorTheme = this.colorThemes.activeTheme;
  currentMode = this.themeService.theme;
  themePreviewGradient = computed(() => this.colorThemes.getPreviewGradient(this.activeColorTheme(), this.currentMode()));

  fontScale = this.accessibility.fontScale;
  fontScaleMin = this.accessibility.fontScaleMin;
  fontScaleMax = this.accessibility.fontScaleMax;
  fontScaleStep = this.accessibility.fontScaleStep;
  fontScaleDefault = this.accessibility.fontScaleDefault;
  fontScalePercent = computed(() => Math.round(this.fontScale() * 100));
  isDyslexicFontEnabled = this.accessibility.dyslexicFontEnabled;
  isHighContrastEnabled = this.accessibility.highContrastEnabled;

  isExportingData = signal(false);
  isExportingDeviceData = signal(false);
  isClearingDeviceData = signal(false);
  isPreparingProviderExport = signal(false);
  isPreparingProviderDelete = signal(false);
  isDeletingAccount = signal(false);

  constructor() {
    effect(() => {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_THEME_SETTINGS_EXPANDED, String(this.isThemeSettingsExpanded()));
    });

    effect(() => {
      const user = this.authService.currentUser();
      if (!user) {
        this.lastRefreshUserId.set(null);
        return;
      }
      if (this.lastRefreshUserId() === user.uid) return;
      this.lastRefreshUserId.set(user.uid);
      void this.offlinePreloadService.refreshAvailableContentIds();
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

  async resetOfflineCache(): Promise<void> {
    if (this.isResettingCache()) return;

    const confirmed = confirm(
      this.translate.instant('settings.page.offline.resetConfirm')
    );
    if (!confirmed) return;

    this.isResettingCache.set(true);
    try {
      await this.offlinePreloadService.resetOfflineCache();
      this.toastService.success(
        this.translate.instant('settings.page.offline.resetDone'),
        2000
      );
      setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      console.error('Failed to reset offline cache:', error);
      this.toastService.error(
        this.translate.instant('settings.page.offline.resetFailed')
      );
    } finally {
      this.isResettingCache.set(false);
    }
  }

  toggleThemeSettings(): void {
    this.isThemeSettingsExpanded.update((v) => !v);
  }

  setHighContrastEnabled(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.accessibility.setHighContrastEnabled(Boolean(target?.checked));
  }

  setDyslexicFontEnabled(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.accessibility.setDyslexicFontEnabled(Boolean(target?.checked));
  }

  onFontScaleInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const value = Number.parseFloat(target.value);
    if (Number.isNaN(value)) return;
    this.accessibility.setFontScale(value);
  }

  increaseFontScale(): void {
    this.accessibility.increaseFontScale();
  }

  decreaseFontScale(): void {
    this.accessibility.decreaseFontScale();
  }

  resetFontScale(): void {
    this.accessibility.resetFontScale();
  }

  async exportUserData(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || this.isExportingData()) {
      return;
    }

    this.isExportingData.set(true);
    try {
      const payload = await this.accountData.exportUserData(user.uid);
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

      const date = new Date().toISOString().slice(0, 10);
      const filename = `dsgvo-export-${date}.json`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      this.toastService.success(this.translate.instant('settings.page.account.export.success'), 2500);
    } catch (error) {
      console.error('Failed to export user data:', error);
      this.toastService.error(this.translate.instant('settings.page.account.export.failed'));
    } finally {
      this.isExportingData.set(false);
    }
  }

  async exportDeviceData(): Promise<void> {
    if (this.isExportingDeviceData()) {
      return;
    }

    this.isExportingDeviceData.set(true);
    try {
      const payload = await this.collectDeviceData();
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      this.downloadContent(json, `device-data-export-${date}.json`, 'application/json;charset=utf-8');
      this.toastService.success(this.translate.instant('settings.page.account.deviceExport.success'), 2500);
    } catch (error) {
      console.error('Failed to export device data:', error);
      this.toastService.error(this.translate.instant('settings.page.account.deviceExport.failed'));
    } finally {
      this.isExportingDeviceData.set(false);
    }
  }

  async clearDeviceData(): Promise<void> {
    if (this.isClearingDeviceData()) {
      return;
    }

    const confirmed = confirm(
      this.translate.instant('settings.page.account.deviceDelete.confirm')
    );
    if (!confirmed) return;

    this.isClearingDeviceData.set(true);
    try {
      this.clearStorage(typeof localStorage === 'undefined' ? undefined : localStorage);
      this.clearStorage(typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
      await Promise.all([
        this.clearIndexedDb(),
        this.clearCaches(),
        this.unregisterServiceWorkers()
      ]);
      this.toastService.success(this.translate.instant('settings.page.account.deviceDelete.success'), 2500);

      const reload = confirm(
        this.translate.instant('settings.page.account.deviceDelete.reloadConfirm')
      );
      if (reload && typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to clear device data:', error);
      this.toastService.error(this.translate.instant('settings.page.account.deviceDelete.failed'));
    } finally {
      this.isClearingDeviceData.set(false);
    }
  }

  async requestProviderExport(): Promise<void> {
    if (this.isPreparingProviderExport()) {
      return;
    }

    this.isPreparingProviderExport.set(true);
    try {
      const payload = this.buildProviderRequestPayload('export');
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      this.downloadContent(json, `provider-logs-export-${date}.json`, 'application/json;charset=utf-8');
      this.toastService.success(this.translate.instant('settings.page.account.providerExport.success'), 2500);
    } catch (error) {
      console.error('Failed to prepare provider export request:', error);
      this.toastService.error(this.translate.instant('settings.page.account.providerExport.failed'));
    } finally {
      this.isPreparingProviderExport.set(false);
    }
  }

  async requestProviderDelete(): Promise<void> {
    if (this.isPreparingProviderDelete()) {
      return;
    }

    const confirmed = confirm(
      this.translate.instant('settings.page.account.providerDelete.confirm')
    );
    if (!confirmed) return;

    this.isPreparingProviderDelete.set(true);
    try {
      const payload = this.buildProviderRequestPayload('delete');
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      this.downloadContent(json, `provider-logs-delete-${date}.json`, 'application/json;charset=utf-8');
      this.toastService.success(this.translate.instant('settings.page.account.providerDelete.success'), 2500);
    } catch (error) {
      console.error('Failed to prepare provider delete request:', error);
      this.toastService.error(this.translate.instant('settings.page.account.providerDelete.failed'));
    } finally {
      this.isPreparingProviderDelete.set(false);
    }
  }

  resetConsent(): void {
    const confirmed = confirm(
      this.translate.instant('settings.page.account.consent.confirm')
    );
    if (!confirmed) return;

    this.consentService.resetConsent();
    this.toastService.success(
      this.translate.instant('settings.page.account.consent.success'),
      2000
    );
  }

  async deleteAccount(): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || this.isDeletingAccount()) {
      return;
    }

    const confirmText = this.translate.instant('settings.page.account.delete.confirm');
    const confirmFinal = this.translate.instant('settings.page.account.delete.confirmFinal');

    if (!confirm(confirmText)) {
      return;
    }
    if (!confirm(confirmFinal)) {
      return;
    }

    this.isDeletingAccount.set(true);
    let dataDeleted = false;
    let authDeleted = false;
    try {
      await this.accountData.deleteUserData(user.uid, user.email);
      dataDeleted = true;
      try {
        await this.authService.deleteCurrentUser();
        authDeleted = true;
      } catch (error: any) {
        if (error?.code === 'auth/requires-recent-login') {
          try {
            await this.authService.reauthenticateWithGoogle();
            await this.authService.deleteCurrentUser();
            authDeleted = true;
          } catch (reauthError) {
            console.error('Reauthentication failed:', reauthError);
            this.toastService.error(this.translate.instant('settings.page.account.delete.reauthFailed'));
          }
        } else {
          console.error('Auth account deletion failed:', error);
          this.toastService.error(this.translate.instant('settings.page.account.delete.failed'));
        }
      }

      if (authDeleted) {
        this.toastService.success(this.translate.instant('settings.page.account.delete.success'), 3000);
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      this.toastService.error(this.translate.instant('settings.page.account.delete.failed'));
    } finally {
      if (dataDeleted) {
        await this.authService.signOut();
      }
      this.isDeletingAccount.set(false);
    }
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

  private downloadContent(content: string, filename: string, type: string): void {
    if (typeof window === 'undefined') return;
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private async collectDeviceData(): Promise<Record<string, any>> {
    const user = this.authService.currentUser();
    const [indexedDb, cachesInfo, serviceWorkers, storageEstimate] = await Promise.all([
      this.listIndexedDbDatabases(),
      this.listCaches(),
      this.listServiceWorkers(),
      this.getStorageEstimate()
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        uid: user?.uid || null,
        email: user?.email || null
      },
      localStorage: this.readStorage(typeof localStorage === 'undefined' ? undefined : localStorage),
      sessionStorage: this.readStorage(typeof sessionStorage === 'undefined' ? undefined : sessionStorage),
      indexedDb,
      caches: cachesInfo,
      serviceWorkers,
      storageEstimate
    };
  }

  private readStorage(storage: Storage | undefined): Record<string, string> {
    const data: Record<string, string> = {};
    if (!storage) return data;
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        const value = storage.getItem(key);
        data[key] = value ?? '';
      }
    } catch (error) {
      console.warn('Failed to read storage:', error);
    }
    return data;
  }

  private async listIndexedDbDatabases(): Promise<{ supported: boolean; databases: Array<{ name: string; version: number }> }> {
    if (typeof indexedDB === 'undefined') {
      return { supported: false, databases: [] };
    }

    const anyIndexedDb = indexedDB as any;
    if (typeof anyIndexedDb.databases !== 'function') {
      return { supported: false, databases: [] };
    }

    try {
      const databases = await anyIndexedDb.databases();
      const result = (databases || [])
        .filter((db: any) => typeof db?.name === 'string')
        .map((db: any) => ({ name: db.name as string, version: Number(db.version || 0) }));
      return { supported: true, databases: result };
    } catch (error) {
      console.warn('Failed to list IndexedDB databases:', error);
      return { supported: false, databases: [] };
    }
  }

  private async listCaches(): Promise<{ supported: boolean; keys: string[] }> {
    if (typeof caches === 'undefined') {
      return { supported: false, keys: [] };
    }
    try {
      const keys = await caches.keys();
      return { supported: true, keys };
    } catch (error) {
      console.warn('Failed to list caches:', error);
      return { supported: false, keys: [] };
    }
  }

  private async listServiceWorkers(): Promise<{ supported: boolean; registrations: Array<{ scope: string; active: string | null; waiting: string | null; installing: string | null }> }> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return { supported: false, registrations: [] };
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const registrations = regs.map(reg => ({
        scope: reg.scope,
        active: reg.active?.scriptURL || null,
        waiting: reg.waiting?.scriptURL || null,
        installing: reg.installing?.scriptURL || null
      }));
      return { supported: true, registrations };
    } catch (error) {
      console.warn('Failed to list service workers:', error);
      return { supported: false, registrations: [] };
    }
  }

  private async getStorageEstimate(): Promise<{ quota?: number; usage?: number } | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return null;
    }
    try {
      const estimate = await navigator.storage.estimate();
      return { quota: estimate.quota, usage: estimate.usage };
    } catch (error) {
      console.warn('Failed to get storage estimate:', error);
      return null;
    }
  }

  private clearStorage(storage: Storage | undefined): void {
    if (!storage) return;
    try {
      storage.clear();
    } catch (error) {
      console.warn('Failed to clear storage:', error);
    }
  }

  private async clearIndexedDb(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    const anyIndexedDb = indexedDB as any;
    if (typeof anyIndexedDb.databases !== 'function') return;

    try {
      const databases = await anyIndexedDb.databases();
      const deletions = (databases || [])
        .filter((db: any) => typeof db?.name === 'string')
        .map((db: any) => this.deleteIndexedDb(db.name as string));
      await Promise.all(deletions);
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }
  }

  private deleteIndexedDb(name: string): Promise<void> {
    return new Promise(resolve => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  private async clearCaches(): Promise<void> {
    if (typeof caches === 'undefined') return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (error) {
      console.warn('Failed to clear caches:', error);
    }
  }

  private async unregisterServiceWorkers(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    } catch (error) {
      console.warn('Failed to unregister service workers:', error);
    }
  }

  private buildProviderRequestPayload(type: 'export' | 'delete'): Record<string, any> {
    const user = this.authService.currentUser();
    return {
      type,
      requestedAt: new Date().toISOString(),
      user: {
        uid: user?.uid || null,
        email: user?.email || null
      },
      contact: {
        email: environment.dataProtection.contactEmail || null,
        name: environment.dataProtection.contactName || null,
        city: environment.dataProtection.city || null,
        zipCode: environment.dataProtection.zipCode || null,
        country: environment.dataProtection.country || null
      },
      providers: {
        render: {
          logs: true
        }
      },
      note: 'Provider-managed logs are not directly accessible in-app and require manual processing.'
    };
  }
}
