import { Component, input, signal, effect, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FollowService } from '../../../core/services/follow.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-follow-button',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule
  ],
  templateUrl: './follow-button.component.html',
  styleUrls: ['./follow-button.component.scss']
})
export class FollowButtonComponent implements OnInit, OnDestroy {
  private followService = inject(FollowService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private translate = inject(TranslateService);

  // Input: the user ID to follow/unfollow
  userId = input.required<string>();

  // Optional: compact mode for smaller buttons
  compact = input<boolean>(false);

  // State
  isFollowing = signal(false);
  isLoading = signal(false);
  isOwnProfile = signal(false);

  constructor() {
    // React to userId changes
    effect(() => {
      const targetUserId = this.userId();
      const currentUser = this.authService.currentUser();

      if (currentUser && targetUserId) {
        this.isOwnProfile.set(currentUser.uid === targetUserId);
        if (!this.isOwnProfile()) {
          this.checkFollowStatus(targetUserId);
        }
      }
    });
  }

  ngOnInit(): void {
    // Initial check is handled by effect
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private async checkFollowStatus(targetUserId: string): Promise<void> {
    try {
      const following = await this.followService.checkAndCacheFollowStatus(targetUserId);
      this.isFollowing.set(following);
    } catch (error) {
      console.error('Error checking follow status:', error);
    }
  }

  async toggleFollow(): Promise<void> {
    if (this.isLoading() || this.isOwnProfile()) {
      return;
    }

    const targetUserId = this.userId();
    const currentlyFollowing = this.isFollowing();

    this.isLoading.set(true);

    try {
      if (currentlyFollowing) {
        await this.followService.unfollowUser(targetUserId);
        this.isFollowing.set(false);
        this.toastService.info(this.translate.instant('follow.unfollowed'));
      } else {
        await this.followService.followUser(targetUserId);
        this.isFollowing.set(true);
        this.toastService.success(this.translate.instant('follow.followed'));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      this.toastService.error(this.translate.instant('follow.error'));
      // Revert optimistic update
      this.isFollowing.set(currentlyFollowing);
    } finally {
      this.isLoading.set(false);
    }
  }
}
