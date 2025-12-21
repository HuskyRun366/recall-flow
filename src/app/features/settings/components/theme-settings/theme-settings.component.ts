import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { ColorTheme, ColorThemeService, StoredColorThemeV1 } from '../../../../core/services/color-theme.service';
import { ThemeDocumentService } from '../../../../core/services/theme-document.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { ToastService } from '../../../../core/services/toast.service';
import { MarketplaceTheme } from '../../../../models';

@Component({
  selector: 'app-theme-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './theme-settings.component.html',
  styleUrl: './theme-settings.component.scss'
})
export class ThemeSettingsComponent {
  private colorThemes = inject(ColorThemeService);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private themeDocs = inject(ThemeDocumentService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private toastService = inject(ToastService);

  // Data
  presets = this.colorThemes.presets;
  storedThemes = this.colorThemes.customThemes;

  activeThemeId = this.colorThemes.activeThemeId;
  activeTheme = this.colorThemes.activeTheme;
  currentMode = this.themeService.theme;

  userThemes = signal<MarketplaceTheme[]>([]);
  isLoadingUserThemes = signal(false);

  displayName(theme: ColorTheme): string {
    return theme.labelKey ? theme.labelKey : theme.name;
  }

  previewGradient(theme: ColorTheme): string {
    return this.colorThemes.getPreviewGradient(theme, this.currentMode());
  }

  previewGradientForStoredTheme(theme: StoredColorThemeV1): string {
    const asTheme: ColorTheme = {
      id: theme.id,
      name: theme.name,
      source: theme.source,
      originId: theme.originId,
      palette: theme.palette,
      darkPalette: theme.darkPalette
    };
    return this.previewGradient(asTheme);
  }

  ownedThemes = computed(() => this.storedThemes().filter((t) => t.source === 'custom'));
  installedThemes = computed(() => this.storedThemes().filter((t) => t.source === 'community'));

  userThemeById = computed(() => {
    return new Map(this.userThemes().map((t) => [t.id, t] as const));
  });

  selectTheme(id: string): void {
    this.colorThemes.setActiveThemeId(id);
  }

  resetToDefault(): void {
    this.colorThemes.resetToDefault();
  }

  createTheme(): void {
    this.router.navigate(['/settings/theme-editor/new']);
  }

  editTheme(theme: StoredColorThemeV1, event?: Event): void {
    event?.stopPropagation();

    const isRemoteTheme = this.userThemeById().has(theme.id);
    if (isRemoteTheme) {
      this.router.navigate(['/settings/theme-editor', theme.id]);
      return;
    }

    this.router.navigate(['/settings/theme-editor/new'], {
      queryParams: { cloneFrom: theme.id }
    });
  }

  async removeInstalledTheme(theme: StoredColorThemeV1, event?: Event): Promise<void> {
    event?.stopPropagation();

    const confirmed = confirm(
      this.translate.instant('settings.page.theme.marketplace.uninstallConfirm', { name: theme.name })
    );
    if (!confirmed) return;

    this.colorThemes.deleteCustomTheme(theme.id);
    if (theme.originId) {
      try {
        await this.themeDocs.updateInstallCount(theme.originId, -1);
      } catch (err) {
        console.warn('Failed to update theme install count:', err);
      }
    }
    this.toastService.success(
      this.translate.instant('settings.page.theme.marketplace.uninstalled', { name: theme.name }),
      2000
    );
  }

  visibilityLabelKey(themeId: string): string | null {
    const theme = this.userThemeById().get(themeId);
    if (!theme) return null;
    return theme.visibility === 'public' ? 'quiz.visibility.public' : 'quiz.visibility.private';
  }

  constructor() {
    effect((onCleanup) => {
      const user = this.authService.currentUser();
      if (!user) {
        this.userThemes.set([]);
        return;
      }

      this.isLoadingUserThemes.set(true);

      const sub = this.themeDocs.getThemesForUser(user.uid).subscribe({
          next: (themes) => {
            this.userThemes.set(themes);
            themes.forEach((t) => {
              this.colorThemes.upsertCustomTheme({
                id: t.id,
                name: t.title,
                primary: t.palette.primary,
                accent: t.palette.accent,
                visibility: t.visibility
              });
            });
            this.isLoadingUserThemes.set(false);
          },
          error: (err) => {
            console.error('Failed to load user themes:', err);
            this.isLoadingUserThemes.set(false);
          }
        });

      onCleanup(() => sub.unsubscribe());
    });
  }
}
