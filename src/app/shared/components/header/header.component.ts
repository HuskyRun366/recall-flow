import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { UpdatesService } from '../../../core/services/updates.service';
import { NetworkStatusComponent } from '../network-status/network-status.component';
import { signal } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, A11yModule, NetworkStatusComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private updatesService = inject(UpdatesService);

  currentUser = this.authService.currentUser;
  isAuthenticated = this.authService.isAuthenticated;
  currentTheme = this.themeService.theme;
  isDarkMode = computed(() => this.currentTheme() === 'dark');
  mobileMenuOpen = signal(false);
  profileMenuOpen = signal(false);
  hasNewUpdates = this.updatesService.hasNewUpdates;

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  async signOut(): Promise<void> {
    this.closeProfileMenu();
    await this.authService.signOut();
  }

  onImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.style.display = 'none';

    // Show placeholder instead
    const placeholder = document.createElement('div');
    placeholder.className = 'user-avatar-placeholder';
    placeholder.textContent = this.currentUser()?.displayName?.charAt(0) || 'U';
    imgElement.parentElement?.appendChild(placeholder);
  }
}
