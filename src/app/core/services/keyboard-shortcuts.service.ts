import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface ShortcutConfig {
  key: string;
  ctrlOrCmd?: boolean;
  description: string;
  action: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService {
  private shortcuts = new Map<string, ShortcutConfig>();
  shortcutsEnabled = signal(true);

  constructor(private router: Router) {
    this.registerGlobalShortcuts();
  }

  private registerGlobalShortcuts(): void {
    // Global shortcuts (work everywhere)
    this.register({
      key: 'k',
      ctrlOrCmd: true,
      description: 'Search öffnen',
      action: () => this.focusSearch()
    });

    this.register({
      key: 'n',
      ctrlOrCmd: true,
      description: 'Neues Quiz erstellen',
      action: () => this.router.navigate(['/quiz', 'editor', 'new'])
    });

    this.register({
      key: 'h',
      ctrlOrCmd: true,
      description: 'Zur Startseite',
      action: () => this.router.navigate(['/quiz', 'home'])
    });
  }

  register(config: ShortcutConfig): void {
    const key = this.getShortcutKey(config.key, config.ctrlOrCmd);
    this.shortcuts.set(key, config);
  }

  unregister(key: string, ctrlOrCmd?: boolean): void {
    const shortcutKey = this.getShortcutKey(key, ctrlOrCmd);
    this.shortcuts.delete(shortcutKey);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.shortcutsEnabled()) return false;

    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return false;
    }

    const ctrlOrCmd = event.ctrlKey || event.metaKey;
    const shortcutKey = this.getShortcutKey(event.key.toLowerCase(), ctrlOrCmd);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut) {
      event.preventDefault();
      shortcut.action();
      return true;
    }

    return false;
  }

  private getShortcutKey(key: string, ctrlOrCmd?: boolean): string {
    return ctrlOrCmd ? `ctrl+${key}` : key;
  }

  private focusSearch(): void {
    const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  getShortcuts(): ShortcutConfig[] {
    return Array.from(this.shortcuts.values());
  }
}
