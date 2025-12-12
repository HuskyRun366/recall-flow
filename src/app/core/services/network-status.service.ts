import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NetworkStatusService {
  isOnline = signal(navigator.onLine);
  wasOffline = signal(false);

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Network: Online');
      this.isOnline.set(true);

      // Show sync notification if we were offline
      if (this.wasOffline()) {
        console.log('🔄 Syncing offline changes...');
        this.showSyncNotification();
      }
      this.wasOffline.set(false);
    });

    window.addEventListener('offline', () => {
      console.log('📵 Network: Offline');
      this.isOnline.set(false);
      this.wasOffline.set(true);
    });
  }

  private showSyncNotification(): void {
    // This could trigger a toast/snackbar in the future
    console.log('✅ Offline changes will be synced automatically');
  }

  getStatus(): 'online' | 'offline' {
    return this.isOnline() ? 'online' : 'offline';
  }
}
