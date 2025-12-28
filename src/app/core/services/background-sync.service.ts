import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ToastService } from './toast.service';
import { ProgressService } from './progress.service';
import { FirestoreService } from './firestore.service';

export interface SyncAction {
  id: string;
  type: 'quiz-progress' | 'quiz-answer' | 'quiz-update' | 'quiz-create';
  data: any;
  timestamp: number;
  retryCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class BackgroundSyncService {
  private toastService = inject(ToastService);
  private progressService = inject(ProgressService);
  private firestoreService = inject(FirestoreService);
  private syncQueue: SyncAction[] = [];
  private dbName = 'quiz-app-sync';
  private storeName = 'pending-actions';
  private db: IDBDatabase | null = null;
  private online = navigator.onLine;

  constructor() {
    this.initDB();
    this.setupEventListeners();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadQueueFromDB();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  private setupEventListeners(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Register for Background Sync if available
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      this.registerBackgroundSync();
    }
  }

  private async registerBackgroundSync(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register('sync-quiz-actions');
      console.log('📡 Background Sync registered');
    } catch (error) {
      console.warn('Background Sync registration failed:', error);
    }
  }

  private handleOnline(): void {
    console.log('🌐 Connection restored');
    this.online = true;
    this.toastService.success('Verbindung wiederhergestellt');
    this.processSyncQueue();
  }

  private handleOffline(): void {
    console.log('📵 Connection lost');
    this.online = false;
    this.toastService.warning('Offline-Modus aktiviert');
  }

  async queueAction(action: Omit<SyncAction, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const syncAction: SyncAction = {
      ...action,
      id: `${action.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.syncQueue.push(syncAction);
    await this.saveActionToDB(syncAction);

    console.log(`📥 Queued action: ${syncAction.type}`, syncAction);

    if (!this.online) {
      this.toastService.info('Aktion wird später synchronisiert', 4000);
    } else {
      // If online, process immediately
      this.processSyncQueue();
    }
  }

  private async saveActionToDB(action: SyncAction): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not initialized');
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(action);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async loadQueueFromDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        this.syncQueue = request.result || [];
        console.log(`📂 Loaded ${this.syncQueue.length} pending actions from IndexedDB`);

        if (this.syncQueue.length > 0 && this.online) {
          this.processSyncQueue();
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async removeActionFromDB(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async processSyncQueue(): Promise<void> {
    if (!this.online || this.syncQueue.length === 0) {
      return;
    }

    console.log(`🔄 Processing ${this.syncQueue.length} queued actions`);

    const actionsToProcess = [...this.syncQueue];

    for (const action of actionsToProcess) {
      try {
        await this.executeAction(action);

        // Remove from queue and DB
        this.syncQueue = this.syncQueue.filter(a => a.id !== action.id);
        await this.removeActionFromDB(action.id);

        console.log(`✅ Successfully synced: ${action.type}`);
      } catch (error) {
        console.error(`❌ Failed to sync action ${action.type}:`, error);

        // Increment retry count
        action.retryCount++;

        // Remove if too many retries (max 3)
        if (action.retryCount >= 3) {
          this.syncQueue = this.syncQueue.filter(a => a.id !== action.id);
          await this.removeActionFromDB(action.id);
          this.toastService.error(`Synchronisation fehlgeschlagen: ${action.type}`, 5000);
        } else {
          // Update retry count in DB
          await this.saveActionToDB(action);
        }
      }
    }

    if (this.syncQueue.length === 0) {
      this.toastService.success('Alle Änderungen synchronisiert');
    }
  }

  private async executeAction(action: SyncAction): Promise<void> {
    try {
      switch (action.type) {
        case 'quiz-progress':
          // Delegate to ProgressService
          await this.progressService.updateQuestionProgress(
            action.data.quizId,
            action.data.userId,
            action.data.questionId,
            action.data.isCorrect
          );
          break;

        case 'quiz-answer':
          // Log answer without progress update
          console.log('Syncing quiz answer:', action.data);
          break;

        case 'quiz-update':
          // Delegate to FirestoreService
          const updates = action.data.updates;
          await firstValueFrom(this.firestoreService.updateQuiz(action.data.quizId, updates));
          break;

        case 'quiz-create':
          // Delegate to FirestoreService
          const quizData = action.data;
          await firstValueFrom(this.firestoreService.createQuiz(quizData));
          break;

        default:
          console.warn('Unknown action type:', action.type);
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (error: any) {
      console.error(`Failed to execute action ${action.type}:`, error);
      throw error;
    }
  }

  // Public method to manually trigger sync
  async syncNow(): Promise<void> {
    if (!this.online) {
      this.toastService.warning('Keine Internetverbindung');
      return;
    }

    await this.processSyncQueue();
  }

  // Get pending actions count
  getPendingCount(): number {
    return this.syncQueue.length;
  }

  // Check if online
  isOnline(): boolean {
    return this.online;
  }
}
