import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { initializeFirestore, provideFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, memoryLocalCache } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { getMessaging, provideMessaging } from '@angular/fire/messaging';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      })
    ),
    provideAnimationsAsync(),
    provideHttpClient(),
    // Translation (i18n) support
    provideTranslateService({
      fallbackLang: 'de',
      loader: provideTranslateHttpLoader({
        prefix: '/assets/i18n/',
        suffix: '.json'
      })
    }),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    // Firestore with offline persistence enabled (fallbacks for PWA/iOS quirks)
    provideFirestore(() => {
      const app = getApp();
      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '');
      const isStandalone =
        typeof window !== 'undefined' &&
        (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
      const transportSettings = !isDevMode()
        ? { experimentalAutoDetectLongPolling: true, useFetchStreams: false }
        : {};

      // iOS PWA: use single-tab persistence (more reliable than multi-tab on iOS).
      if (isIOS && isStandalone) {
        try {
          return initializeFirestore(app, {
            localCache: persistentLocalCache({
              tabManager: persistentSingleTabManager({ forceOwnership: true })
            }),
            ...transportSettings
          });
        } catch (error) {
          console.warn('⚠️ iOS PWA single-tab persistence unavailable, using memory cache:', error);
          return initializeFirestore(app, {
            localCache: memoryLocalCache(),
            ...transportSettings
          });
        }
      }

      try {
        return initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          }),
          ...transportSettings
        });
      } catch (error) {
        console.warn('⚠️ Multi-tab persistence unavailable, falling back:', error);
        try {
          return initializeFirestore(app, {
            localCache: persistentLocalCache({
              tabManager: persistentSingleTabManager({})
            }),
            ...transportSettings
          });
        } catch (fallbackError) {
          console.warn('⚠️ Persistent cache unavailable, using memory cache:', fallbackError);
          return initializeFirestore(app, {
            localCache: memoryLocalCache(),
            ...transportSettings
          });
        }
      }
    }),
    provideStorage(() => getStorage()),
    provideMessaging(() => getMessaging()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
