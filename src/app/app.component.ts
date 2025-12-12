import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shared/components/header/header.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { PwaInstallPromptComponent } from './shared/components/pwa-install-prompt/pwa-install-prompt.component';
import { PwaUpdatePromptComponent } from './shared/components/pwa-update-prompt/pwa-update-prompt.component';
import { IosInstallPromptComponent } from './shared/components/ios-install-prompt/ios-install-prompt.component';
import { PwaService } from './core/services/pwa.service';
import { OfflinePreloadService } from './core/services/offline-preload.service';
import { BackgroundSyncService } from './core/services/background-sync.service';
import { BadgingService } from './core/services/badging.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    ToastComponent,
    PwaInstallPromptComponent,
    PwaUpdatePromptComponent,
    IosInstallPromptComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'quiz-app';
  private pwaService = inject(PwaService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private backgroundSyncService = inject(BackgroundSyncService);
  private badgingService = inject(BadgingService);
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private swUpdate = inject(SwUpdate);

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    this.keyboardShortcuts.handleKeyDown(event);
  }

  ngOnInit(): void {
    // Initialize PWA service
    console.log('🚀 PWA Service initialized');

    // Initialize offline preload service
    this.offlinePreloadService.init();
    console.log('📦 Offline Preload Service initialized');

    // Background Sync service is initialized automatically via constructor
    console.log('🔄 Background Sync Service initialized');

    // Badging service is initialized automatically and listens for auth changes
    if (this.badgingService.isSupported()) {
      console.log('📛 Badging API supported and initialized');
    } else {
      console.log('⚠️ Badging API not supported on this device');
    }

    // Auto-activate new Service Worker versions to avoid stale clients
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.swUpdate.activateUpdate().then(() => document.location.reload());
        });
    }
  }
}
