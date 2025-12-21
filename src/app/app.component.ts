import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { trigger, transition, style, animate, query, group } from '@angular/animations';
import { TranslateModule } from '@ngx-translate/core';
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
import { ColorThemeService } from './core/services/color-theme.service';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

const ROUTE_TRANSITION_TIMING = '220ms cubic-bezier(0.4, 0, 0.2, 1)';
const ROUTE_SLIDE_DISTANCE_PX = 24;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    TranslateModule,
    HeaderComponent,
    ToastComponent,
    PwaInstallPromptComponent,
    PwaUpdatePromptComponent,
    IosInstallPromptComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [
    trigger('routeAnimation', [
      transition(':increment', [
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: '100%'
          })
        ], { optional: true }),
        query(':enter', [
          style({ transform: `translateX(${ROUTE_SLIDE_DISTANCE_PX}px)`, opacity: 0 })
        ], { optional: true }),
        group([
          query(':leave', [
            animate(ROUTE_TRANSITION_TIMING, style({ transform: `translateX(-${ROUTE_SLIDE_DISTANCE_PX}px)`, opacity: 0 }))
          ], { optional: true }),
          query(':enter', [
            animate(ROUTE_TRANSITION_TIMING, style({ transform: 'translateX(0)', opacity: 1 }))
          ], { optional: true })
        ])
      ]),
      transition(':decrement', [
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: '100%'
          })
        ], { optional: true }),
        query(':enter', [
          style({ transform: `translateX(-${ROUTE_SLIDE_DISTANCE_PX}px)`, opacity: 0 })
        ], { optional: true }),
        group([
          query(':leave', [
            animate(ROUTE_TRANSITION_TIMING, style({ transform: `translateX(${ROUTE_SLIDE_DISTANCE_PX}px)`, opacity: 0 }))
          ], { optional: true }),
          query(':enter', [
            animate(ROUTE_TRANSITION_TIMING, style({ transform: 'translateX(0)', opacity: 1 }))
          ], { optional: true })
        ])
      ]),
      // Fallback (non-numeric states)
      transition('* <=> *', [
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            width: '100%'
          })
        ], { optional: true }),
        query(':enter', [style({ opacity: 0 })], { optional: true }),
        group([
          query(':leave', [animate(ROUTE_TRANSITION_TIMING, style({ opacity: 0 }))], { optional: true }),
          query(':enter', [animate(ROUTE_TRANSITION_TIMING, style({ opacity: 1 }))], { optional: true })
        ])
      ])
    ])
  ]
})
export class AppComponent implements OnInit {
  title = 'quiz-app';
  isRouteTransitioning = false;
  prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  private pwaService = inject(PwaService);
  private offlinePreloadService = inject(OfflinePreloadService);
  private backgroundSyncService = inject(BackgroundSyncService);
  private badgingService = inject(BadgingService);
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private colorThemeService = inject(ColorThemeService);
  private swUpdate = inject(SwUpdate);

  /**
   * Get route animation state for route-based transitions
   */
  prepareRoute(outlet: RouterOutlet): number {
    return outlet?.activatedRouteData?.['animationIndex'] ?? 0;
  }

  onRouteAnimationStart(): void {
    this.isRouteTransitioning = true;
  }

  onRouteAnimationDone(): void {
    this.isRouteTransitioning = false;
  }

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

    // Refresh installed marketplace themes so updates propagate on reload
    void this.colorThemeService.refreshMarketplaceThemes();

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
