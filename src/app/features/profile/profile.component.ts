import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { FollowService } from '../../core/services/follow.service';
import { FirestoreService } from '../../core/services/firestore.service';
import { User, Quiz } from '../../models';
import { FollowButtonComponent } from '../../shared/components/follow-button/follow-button.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FollowButtonComponent
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private followService = inject(FollowService);
  private firestoreService = inject(FirestoreService);

  // State
  profileUser = signal<User | null>(null);
  publicQuizzes = signal<Quiz[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  // Current user
  currentUser = this.authService.currentUser;

  // Stats
  followerCount = signal(0);
  followingCount = signal(0);

  // Computed
  isOwnProfile = computed(() => {
    const profile = this.profileUser();
    const current = this.currentUser();
    return profile && current && profile.uid === current.uid;
  });

  userId = signal<string>('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('userId');
    if (!id) {
      this.error.set('Ungültige Benutzer-ID');
      this.isLoading.set(false);
      return;
    }

    this.userId.set(id);
    this.loadProfile(id);
  }

  private async loadProfile(userId: string): Promise<void> {
    try {
      // Load user profile
      const user = await this.followService.getUserProfile(userId);
      if (!user) {
        this.error.set('Benutzer nicht gefunden');
        this.isLoading.set(false);
        return;
      }

      this.profileUser.set(user);
      this.followerCount.set(user.followerCount || 0);
      this.followingCount.set(user.followingCount || 0);

      // Load public quizzes by this user
      this.loadPublicQuizzes(userId);

      this.isLoading.set(false);
    } catch (err) {
      console.error('Error loading profile:', err);
      this.error.set('Fehler beim Laden des Profils');
      this.isLoading.set(false);
    }
  }

  private loadPublicQuizzes(userId: string): void {
    this.firestoreService.getPublicQuizzesByOwner(userId).subscribe({
      next: (quizzes) => this.publicQuizzes.set(quizzes),
      error: (err) => console.error('Error loading quizzes:', err)
    });
  }

  getQuizCount(): number {
    return this.publicQuizzes().length;
  }
}
