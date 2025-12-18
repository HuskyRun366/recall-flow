import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ColorTheme, ColorThemeService, StoredColorThemeV1 } from '../../../../core/services/color-theme.service';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-theme-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './theme-settings.component.html',
  styleUrl: './theme-settings.component.scss'
})
export class ThemeSettingsComponent {
  private colorThemes = inject(ColorThemeService);
  private themeService = inject(ThemeService);

  // Data
  presets = this.colorThemes.presets;
  customThemes = this.colorThemes.customThemes;
  communityThemes = this.colorThemes.communityThemes;
  installedCommunityOriginIds = this.colorThemes.installedCommunityOriginIds;

  activeThemeId = this.colorThemes.activeThemeId;
  activeTheme = this.colorThemes.activeTheme;
  currentMode = this.themeService.theme;

  // Form state
  editingThemeId = signal<string | null>(null);
  themeName = signal('');
  primaryColor = signal('#2196f3');
  accentColor = signal('#ff9800');

  importJson = signal('');
  importErrorKey = signal<string | null>(null);

  exportJson = computed(() => this.colorThemes.exportThemeAsJson(this.activeThemeId()) ?? '');

  isEditing = computed(() => this.editingThemeId() !== null);

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

  selectTheme(id: string): void {
    this.colorThemes.setActiveThemeId(id);
  }

  startCreate(): void {
    this.editingThemeId.set(null);
    this.themeName.set('');
    this.primaryColor.set('#2196f3');
    this.accentColor.set('#ff9800');
  }

  startEdit(theme: StoredColorThemeV1): void {
    this.editingThemeId.set(theme.id);
    this.themeName.set(theme.name);
    this.primaryColor.set(theme.palette.primary);
    this.accentColor.set(theme.palette.accent);
  }

  cancelEdit(): void {
    this.startCreate();
  }

  saveTheme(): void {
    const editingId = this.editingThemeId();
    if (!editingId) {
      this.colorThemes.saveCustomTheme({
        name: this.themeName(),
        primary: this.primaryColor(),
        accent: this.accentColor()
      });
      this.startCreate();
      return;
    }

    this.colorThemes.updateCustomTheme(editingId, {
      name: this.themeName(),
      primary: this.primaryColor(),
      accent: this.accentColor()
    });
    this.startCreate();
  }

  deleteTheme(theme: StoredColorThemeV1, event?: Event): void {
    event?.stopPropagation();
    this.colorThemes.deleteCustomTheme(theme.id);
    if (this.editingThemeId() === theme.id) {
      this.startCreate();
    }
  }

  resetToDefault(): void {
    this.colorThemes.resetToDefault();
  }

  installCommunityTheme(originId: string, event?: Event): void {
    event?.stopPropagation();
    this.colorThemes.installCommunityTheme(originId);
  }

  importTheme(): void {
    this.importErrorKey.set(null);

    const id = this.colorThemes.importThemeFromJson(this.importJson());
    if (!id) {
      this.importErrorKey.set('settings.page.theme.import.error');
      return;
    }

    this.importJson.set('');
  }

  async copyExportJson(): Promise<void> {
    const text = this.exportJson();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ignore (clipboard permissions vary)
    }
  }
}

