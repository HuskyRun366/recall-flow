import { Injectable, signal, computed } from '@angular/core';
import { CHANGELOG, getLatestVersion, getChangesSince } from '../../shared/data/changelog';

const STORAGE_KEY = 'lastSeenUpdateVersion';

@Injectable({
  providedIn: 'root'
})
export class UpdatesService {
  private lastSeenVersion = signal<string | null>(this.loadLastSeenVersion());

  // Computed: Gibt es neue Updates?
  hasNewUpdates = computed(() => {
    const lastSeen = this.lastSeenVersion();
    const latest = getLatestVersion();
    return !lastSeen || lastSeen !== latest;
  });

  // Computed: Anzahl neuer Updates
  newUpdatesCount = computed(() => {
    const lastSeen = this.lastSeenVersion();
    if (!lastSeen) return CHANGELOG.length;
    const newChanges = getChangesSince(lastSeen);
    return newChanges.length;
  });

  getAllChanges() {
    return CHANGELOG;
  }

  getNewChanges() {
    const lastSeen = this.lastSeenVersion();
    return lastSeen ? getChangesSince(lastSeen) : CHANGELOG;
  }

  markAsRead(): void {
    const latest = getLatestVersion();
    this.lastSeenVersion.set(latest);
    this.saveLastSeenVersion(latest);
  }

  private loadLastSeenVersion(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private saveLastSeenVersion(version: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, version);
    } catch (e) {
      console.warn('Could not save last seen version', e);
    }
  }
}
