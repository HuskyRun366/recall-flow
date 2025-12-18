import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
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

  constructor(private authService: AuthService) {}

  async signInWithGoogle(): Promise<void> {
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
}
