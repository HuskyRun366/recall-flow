import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { trigger, transition, style, animate, query, group, keyframes } from '@angular/animations';
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

const MODE_TRANSITION_TIMING = '1000ms cubic-bezier(0.16, 1, 0.3, 1)';
const MODE_PERSPECTIVE = 'perspective(1200px)';

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
  styleUrl: './app.component.scss',
  animations: [
    trigger('routeAnimation', [
      transition('quiz => lernen', [
        query(':enter', [
          style({
            zIndex: 2,
            opacity: 0,
            transform:
              `${MODE_PERSPECTIVE} translate3d(18%, 3%, -260px) rotateX(-18deg) rotateY(-16deg) rotateZ(4deg) scale(0.92)`
          })
        ], { optional: true }),
        query(':leave', [
          style({
            zIndex: 1,
            opacity: 1,
            transform: `${MODE_PERSPECTIVE} translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)`
          })
        ], { optional: true }),
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            transformOrigin: '50% 50%'
          })
        ], { optional: true }),
        group([
          query('.route-transition-overlay', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 0,
                transform: 'translate3d(-140%, -6%, 0) skewX(-14deg) rotate(-12deg) scale(1.04)',
                offset: 0
              }),
              style({
                opacity: 0.9,
                transform: 'translate3d(-18%, -2%, 0) skewX(-14deg) rotate(-4deg) scale(1.12)',
                offset: 0.28
              }),
              style({
                opacity: 0.9,
                transform: 'translate3d(16%, 2%, 0) skewX(-10deg) rotate(6deg) scale(1.14)',
                offset: 0.62
              }),
              style({
                opacity: 0,
                transform: 'translate3d(140%, 6%, 0) skewX(-10deg) rotate(14deg) scale(1.04)',
                offset: 1
              })
            ]))
          ], { optional: true }),
          query(':leave', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)`,
                offset: 0
              }),
              style({
                opacity: 0.35,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-2%, -1%, -90px) rotateX(12deg) rotateY(12deg) rotateZ(-2deg) scale(0.98)`,
                offset: 0.24
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-10%, -2%, -240px) rotateX(20deg) rotateY(18deg) rotateZ(-5deg) scale(0.94)`,
                offset: 0.46
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-10%, -2%, -240px) rotateX(20deg) rotateY(18deg) rotateZ(-5deg) scale(0.94)`,
                offset: 1
              })
            ]))
          ], { optional: true }),
          query(':enter', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(18%, 3%, -260px) rotateX(-18deg) rotateY(-16deg) rotateZ(4deg) scale(0.92)`,
                offset: 0
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(18%, 3%, -260px) rotateX(-18deg) rotateY(-16deg) rotateZ(4deg) scale(0.92)`,
                offset: 0.34
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(12%, 2%, -180px) rotateX(-14deg) rotateY(-12deg) rotateZ(3deg) scale(0.94)`,
                offset: 0.46
              }),
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(3%, 0, 34px) rotateX(-6deg) rotateY(-3deg) rotateZ(0deg) scale(1.06)`,
                offset: 0.78
              }),
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(0, 0, 12px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.01)`,
                offset: 0.9
              }),
              style({
                opacity: 1,
                transform: 'none',
                willChange: 'auto',
                offset: 1
              })
            ]))
          ], { optional: true })
        ])
      ]),
      transition('lernen => quiz', [
        query(':enter', [
          style({
            zIndex: 2,
            opacity: 0,
            transform:
              `${MODE_PERSPECTIVE} translate3d(-18%, 3%, -260px) rotateX(18deg) rotateY(16deg) rotateZ(-4deg) scale(0.92)`
          })
        ], { optional: true }),
        query(':leave', [
          style({
            zIndex: 1,
            opacity: 1,
            transform: `${MODE_PERSPECTIVE} translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)`
          })
        ], { optional: true }),
        query(':enter, :leave', [
          style({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            transformOrigin: '50% 50%'
          })
        ], { optional: true }),
        group([
          query('.route-transition-overlay', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 0,
                transform: 'translate3d(140%, -6%, 0) skewX(14deg) rotate(12deg) scale(1.04)',
                offset: 0
              }),
              style({
                opacity: 0.9,
                transform: 'translate3d(18%, -2%, 0) skewX(14deg) rotate(4deg) scale(1.12)',
                offset: 0.28
              }),
              style({
                opacity: 0.9,
                transform: 'translate3d(-16%, 2%, 0) skewX(10deg) rotate(-6deg) scale(1.14)',
                offset: 0.62
              }),
              style({
                opacity: 0,
                transform: 'translate3d(-140%, 6%, 0) skewX(10deg) rotate(-14deg) scale(1.04)',
                offset: 1
              })
            ]))
          ], { optional: true }),
          query(':leave', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)`,
                offset: 0
              }),
              style({
                opacity: 0.35,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(2%, -1%, -90px) rotateX(-12deg) rotateY(-12deg) rotateZ(2deg) scale(0.98)`,
                offset: 0.24
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(10%, -2%, -240px) rotateX(-20deg) rotateY(-18deg) rotateZ(5deg) scale(0.94)`,
                offset: 0.46
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(10%, -2%, -240px) rotateX(-20deg) rotateY(-18deg) rotateZ(5deg) scale(0.94)`,
                offset: 1
              })
            ]))
          ], { optional: true }),
          query(':enter', [
            animate(MODE_TRANSITION_TIMING, keyframes([
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-18%, 3%, -260px) rotateX(18deg) rotateY(16deg) rotateZ(-4deg) scale(0.92)`,
                offset: 0
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-18%, 3%, -260px) rotateX(18deg) rotateY(16deg) rotateZ(-4deg) scale(0.92)`,
                offset: 0.34
              }),
              style({
                opacity: 0,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-12%, 2%, -180px) rotateX(14deg) rotateY(12deg) rotateZ(-3deg) scale(0.94)`,
                offset: 0.46
              }),
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(-3%, 0, 34px) rotateX(6deg) rotateY(3deg) rotateZ(0deg) scale(1.06)`,
                offset: 0.78
              }),
              style({
                opacity: 1,
                transform:
                  `${MODE_PERSPECTIVE} translate3d(0, 0, 12px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.01)`,
                offset: 0.9
              }),
              style({
                opacity: 1,
                transform: 'none',
                willChange: 'auto',
                offset: 1
              })
            ]))
          ], { optional: true })
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
  private router = inject(Router);
  private offlinePreloadService = inject(OfflinePreloadService);
  private backgroundSyncService = inject(BackgroundSyncService);
  private badgingService = inject(BadgingService);
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private swUpdate = inject(SwUpdate);

  /**
   * Get route animation state for mode-based transitions
   */
  getRouteAnimation(): 'quiz' | 'lernen' {
    const url = this.router.url || '';
    return url.startsWith('/lernen') ? 'lernen' : 'quiz';
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
