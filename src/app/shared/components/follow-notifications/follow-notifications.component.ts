import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { A11yModule } from '@angular/cdk/a11y';
import { FollowNotificationsService } from '../../../core/services/follow-notifications.service';

@Component({
  selector: 'app-follow-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, A11yModule],
  templateUrl: './follow-notifications.component.html',
  styleUrls: ['./follow-notifications.component.scss']
})
export class FollowNotificationsComponent {
  private followNotificationsService = inject(FollowNotificationsService);

  notifications = this.followNotificationsService.notifications;
  unreadCount = this.followNotificationsService.unreadCount;
  isLoading = this.followNotificationsService.isLoading;

  dropdownOpen = signal(false);

  toggleDropdown(): void {
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  onNotificationClick(notificationId: string): void {
    this.followNotificationsService.markAsRead(notificationId);
    this.closeDropdown();
  }

  markAllAsRead(): void {
    this.followNotificationsService.markAllAsRead();
  }

  clearAll(): void {
    this.followNotificationsService.clearAll();
  }

  deleteNotification(event: Event, notificationId: string): void {
    event.stopPropagation();
    this.followNotificationsService.deleteNotification(notificationId);
  }

  formatTimeAgo(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Jetzt';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }
}
