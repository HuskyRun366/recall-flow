import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  isLoading = signal(false);
  error = signal<string | null>(null);
  ageConfirmed = signal(false);

  constructor(
    private authService: AuthService,
    private translate: TranslateService
  ) {
    this.loadAgeConfirmation();
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.ageConfirmed()) {
      this.error.set(this.translate.instant('auth.ageConfirmError'));
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.authService.signInWithGoogle();
    } catch (error: any) {
      console.error('Login error:', error);
      this.error.set(error.message || 'Failed to sign in. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setAgeConfirmed(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const confirmed = Boolean(target?.checked);
    this.ageConfirmed.set(confirmed);
    this.error.set(null);

    try {
      localStorage.setItem('recallflow:age-confirmed', confirmed ? 'true' : 'false');
    } catch {
      // Ignore storage failures.
    }
  }

  private loadAgeConfirmation(): void {
    try {
      const stored = localStorage.getItem('recallflow:age-confirmed');
      if (stored === 'true') {
        this.ageConfirmed.set(true);
      }
    } catch {
      // Ignore storage failures.
    }
  }
}
