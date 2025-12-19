import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ColorThemeService } from '../../core/services/color-theme.service';
import { ThemeDocumentService } from '../../core/services/theme-document.service';
import { ToastService } from '../../core/services/toast.service';
import { ThemeVisibility } from '../../models';

type EditorMode = 'new' | 'edit';

@Component({
  selector: 'app-theme-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './theme-editor.component.html',
  styleUrls: ['./theme-editor.component.scss']
})
export class ThemeEditorComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private themeDocs = inject(ThemeDocumentService);
  private colorThemes = inject(ColorThemeService);
  private toastService = inject(ToastService);

  mode = signal<EditorMode>('new');
  themeId = signal<string | null>(null);
  cloneFromId = signal<string | null>(null);

  // Form state
  title = signal('');
  description = signal('');
  visibility = signal<ThemeVisibility>('private');
  primaryColor = signal('#2196f3');
  accentColor = signal('#ff9800');
  backgroundLightColor = signal('#ffffff');
  backgroundDarkColor = signal('#121212');

  isLoading = signal(true);
  isSaving = signal(false);
  error = signal<string | null>(null);

  baseline = signal<{
    title: string;
    description: string;
    visibility: ThemeVisibility;
    primary: string;
    accent: string;
    backgroundLight: string;
    backgroundDark: string;
  } | null>(null);

  previewGradient = computed(() => {
    return `linear-gradient(135deg, ${this.primaryColor()}, ${this.accentColor()})`;
  });

  unsavedChanges = computed(() => {
    const base = this.baseline();
    if (!base) return false;
    return (
      this.title() !== base.title ||
      this.description() !== base.description ||
      this.visibility() !== base.visibility ||
      this.primaryColor() !== base.primary ||
      this.accentColor() !== base.accent ||
      this.backgroundLightColor() !== base.backgroundLight ||
      this.backgroundDarkColor() !== base.backgroundDark
    );
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.mode.set('edit');
      this.themeId.set(id);
      this.loadTheme(id);
      return;
    }

    this.mode.set('new');
    const cloneFrom = this.route.snapshot.queryParamMap.get('cloneFrom');
    if (cloneFrom) {
      const local = this.colorThemes.customThemes().find((t) => t.id === cloneFrom) ?? null;
      if (local) {
        this.cloneFromId.set(local.id);
        this.title.set(local.name);
        this.primaryColor.set(local.palette.primary);
        this.accentColor.set(local.palette.accent);
        const lightBg = local.palette.background || '#ffffff';
        const darkBg = local.darkPalette?.background || local.palette.background || '#121212';
        this.backgroundLightColor.set(lightBg);
        this.backgroundDarkColor.set(darkBg);
      }
    }
    this.isLoading.set(false);
    this.baseline.set({
      title: this.title(),
      description: this.description(),
      visibility: this.visibility(),
      primary: this.primaryColor(),
      accent: this.accentColor(),
      backgroundLight: this.backgroundLightColor(),
      backgroundDark: this.backgroundDarkColor()
    });
  }

  private loadTheme(id: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.themeDocs
      .getThemeById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (theme) => {
          if (!theme) {
            this.error.set('Theme not found');
            this.isLoading.set(false);
            return;
          }

          const user = this.authService.currentUser();
          if (!user || theme.ownerId !== user.uid) {
            this.error.set('You do not have permission to edit this theme');
            this.isLoading.set(false);
            return;
          }

          this.title.set(theme.title);
          this.description.set(theme.description || '');
          this.visibility.set(theme.visibility);
          this.primaryColor.set(theme.palette.primary);
          this.accentColor.set(theme.palette.accent);

          const lightBg = theme.palette.background || '#ffffff';
          const darkBg = theme.darkPalette?.background || theme.palette.background || '#121212';
          this.backgroundLightColor.set(lightBg);
          this.backgroundDarkColor.set(darkBg);

          this.baseline.set({
            title: this.title(),
            description: this.description(),
            visibility: this.visibility(),
            primary: this.primaryColor(),
            accent: this.accentColor(),
            backgroundLight: this.backgroundLightColor(),
            backgroundDark: this.backgroundDarkColor()
          });

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load theme:', err);
          this.error.set('Failed to load theme');
          this.isLoading.set(false);
        }
      });
  }

  async save(): Promise<void> {
    if (this.isSaving()) return;
    const user = this.authService.currentUser();
    if (!user) {
      this.toastService.error('You must be logged in');
      return;
    }

    const title = this.title().trim();
    if (!title) {
      this.toastService.warning('Please enter a title');
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      if (this.mode() === 'new') {
        const id = await firstValueFrom(
          this.themeDocs.createTheme({
            title,
            description: this.description().trim(),
            ownerId: user.uid,
            visibility: this.visibility(),
            palette: {
              primary: this.primaryColor(),
              accent: this.accentColor(),
              background: this.backgroundLightColor()
            },
            darkPalette: {
              background: this.backgroundDarkColor()
            }
          })
        );

        this.colorThemes.upsertCustomTheme({
          id,
          name: title,
          primary: this.primaryColor(),
          accent: this.accentColor(),
          backgroundLight: this.backgroundLightColor(),
          backgroundDark: this.backgroundDarkColor(),
          visibility: this.visibility()
        });
        this.colorThemes.setActiveThemeId(id);

        const cloneFromId = this.cloneFromId();
        if (cloneFromId) {
          this.colorThemes.deleteCustomTheme(cloneFromId);
        }

        this.toastService.success('Saved');
        this.router.navigate(['/settings']);
        return;
      }

      const id = this.themeId();
      if (!id) return;

      await firstValueFrom(
        this.themeDocs.updateTheme(id, {
          title,
          description: this.description().trim(),
          visibility: this.visibility(),
          palette: {
            primary: this.primaryColor(),
            accent: this.accentColor(),
            background: this.backgroundLightColor()
          },
          darkPalette: {
            background: this.backgroundDarkColor()
          }
        })
      );

      this.colorThemes.upsertCustomTheme({
        id,
        name: title,
        primary: this.primaryColor(),
        accent: this.accentColor(),
        backgroundLight: this.backgroundLightColor(),
        backgroundDark: this.backgroundDarkColor(),
        visibility: this.visibility()
      });

      this.baseline.set({
        title: this.title(),
        description: this.description(),
        visibility: this.visibility(),
        primary: this.primaryColor(),
        accent: this.accentColor(),
        backgroundLight: this.backgroundLightColor(),
        backgroundDark: this.backgroundDarkColor()
      });

      this.toastService.success('Saved');
    } catch (err) {
      console.error('Failed to save theme:', err);
      this.error.set('Failed to save theme');
      this.toastService.error('Failed to save theme');
    } finally {
      this.isSaving.set(false);
    }
  }

  async delete(): Promise<void> {
    if (this.mode() !== 'edit') return;
    const id = this.themeId();
    if (!id) return;

    this.isSaving.set(true);
    this.error.set(null);

    try {
      await firstValueFrom(this.themeDocs.deleteTheme(id));
      this.colorThemes.deleteCustomTheme(id);
      this.toastService.success('Deleted');
      this.router.navigate(['/settings']);
    } catch (err) {
      console.error('Failed to delete theme:', err);
      this.toastService.error('Failed to delete theme');
      this.error.set('Failed to delete theme');
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/settings']);
  }
}
