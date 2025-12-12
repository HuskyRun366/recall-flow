import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
  action?: {
    label: string;
    callback: () => void;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts = signal<Toast[]>([]);
  private nextId = 0;

  /**
   * Get all active toasts
   */
  get activeToasts() {
    return this.toasts.asReadonly();
  }

  /**
   * Show a success toast
   */
  success(message: string, duration: number = 3000): string {
    return this.show(message, 'success', duration);
  }

  /**
   * Show an error toast
   */
  error(message: string, duration: number = 5000): string {
    return this.show(message, 'error', duration);
  }

  /**
   * Show an info toast
   */
  info(message: string, duration: number = 3000): string {
    return this.show(message, 'info', duration);
  }

  /**
   * Show a warning toast
   */
  warning(message: string, duration: number = 4000): string {
    return this.show(message, 'warning', duration);
  }

  /**
   * Show a toast with an action button
   */
  showWithAction(
    message: string,
    type: Toast['type'],
    actionLabel: string,
    actionCallback: () => void,
    duration: number = 5000
  ): string {
    return this.show(message, type, duration, {
      label: actionLabel,
      callback: actionCallback
    });
  }

  /**
   * Show a generic toast
   */
  private show(
    message: string,
    type: Toast['type'],
    duration: number,
    action?: Toast['action']
  ): string {
    const id = `toast-${this.nextId++}`;
    const toast: Toast = { id, message, type, duration, action };

    this.toasts.update(toasts => [...toasts, toast]);

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  /**
   * Dismiss a specific toast
   */
  dismiss(id: string): void {
    this.toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  /**
   * Dismiss all toasts
   */
  dismissAll(): void {
    this.toasts.set([]);
  }
}
