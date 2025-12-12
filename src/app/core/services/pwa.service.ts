import { Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  // Installation prompt
  private deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  canInstall = signal(false);
  isInstalled = signal(false);

  // Update notifications
  updateAvailable = signal(false);
  private currentVersion = signal<string>('');
  private latestVersion = signal<string>('');

  constructor(private swUpdate: SwUpdate) {
    this.initializeInstallPrompt();
    this.checkForUpdates();
  }

  /**
   * Initialize PWA install prompt detection
   */
  private initializeInstallPrompt(): void {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled.set(true);
      return;
    }

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      this.deferredPrompt.set(installEvent);
      this.canInstall.set(true);
      console.log('💡 PWA install prompt available');
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt.set(null);
      this.canInstall.set(false);
      this.isInstalled.set(true);
      console.log('✅ PWA installed successfully');
    });
  }

  /**
   * Show install prompt to user
   */
  async promptInstall(): Promise<boolean> {
    const prompt = this.deferredPrompt();
    if (!prompt) {
      console.warn('Install prompt not available');
      return false;
    }

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;

      if (outcome === 'accepted') {
        console.log('✅ User accepted PWA install');
        this.deferredPrompt.set(null);
        this.canInstall.set(false);
        return true;
      } else {
        console.log('❌ User dismissed PWA install');
        return false;
      }
    } catch (error) {
      console.error('Error showing install prompt:', error);
      return false;
    }
  }

  /**
   * Check for app updates
   */
  private checkForUpdates(): void {
    if (!this.swUpdate.isEnabled) {
      console.log('Service Worker updates not enabled');
      return;
    }

    // Check for updates on load
    this.swUpdate.checkForUpdate().then(hasUpdate => {
      if (hasUpdate) {
        console.log('🔄 Update check: New version available');
      }
    });

    // Listen for version updates
    this.swUpdate.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(event => {
        this.currentVersion.set(event.currentVersion.hash);
        this.latestVersion.set(event.latestVersion.hash);
        this.updateAvailable.set(true);
        console.log('🆕 New version available:', {
          current: event.currentVersion.hash,
          latest: event.latestVersion.hash
        });
      });

    // Check for unrecoverable state
    this.swUpdate.unrecoverable.subscribe(event => {
      console.error('⚠️ Service Worker in unrecoverable state:', event.reason);
      if (confirm('Die App muss neu geladen werden, um fortzufahren. Jetzt neu laden?')) {
        window.location.reload();
      }
    });
  }

  /**
   * Activate the latest update
   */
  async activateUpdate(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
      this.updateAvailable.set(false);
      window.location.reload();
    } catch (error) {
      console.error('Error activating update:', error);
    }
  }

  /**
   * Manually check for updates
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      return await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Dismiss install prompt (hide for this session)
   */
  dismissInstallPrompt(): void {
    this.canInstall.set(false);
  }

  /**
   * Get current app version info
   */
  getVersionInfo(): { current: string; latest: string } {
    return {
      current: this.currentVersion(),
      latest: this.latestVersion()
    };
  }
}
