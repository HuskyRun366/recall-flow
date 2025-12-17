import { Component, OnInit, OnDestroy, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { LearningMaterialService } from '../../../core/services/learning-material.service';
import { MaterialParticipantService } from '../../../core/services/material-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ToastService } from '../../../core/services/toast.service';
import { LearningMaterial } from '../../../models';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';

@Component({
  selector: 'app-material-viewer',
  standalone: true,
  imports: [CommonModule, RouterModule, SkeletonLoaderComponent],
  templateUrl: './material-viewer.component.html',
  styleUrls: ['./material-viewer.component.scss']
})
export class MaterialViewerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private materialService = inject(LearningMaterialService);
  private participantService = inject(MaterialParticipantService);
  private authService = inject(AuthService);
  private themeService = inject(ThemeService);
  private toastService = inject(ToastService);

  material = signal<LearningMaterial | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  isFullscreen = signal(false);
  sanitizedContent = signal<SafeHtml | null>(null);

  currentUser = this.authService.currentUser;
  currentTheme = this.themeService.theme;

  canEdit = computed(() => {
    const m = this.material();
    const userId = this.currentUser()?.uid;
    if (!m || !userId) return false;
    return m.ownerId === userId;
  });

  isOwner = computed(() => {
    const m = this.material();
    return m?.ownerId === this.currentUser()?.uid;
  });

  private fullscreenChangeHandler = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  constructor() {
    // Effect to update iframe content when theme changes
    effect(() => {
      const theme = this.currentTheme();
      const m = this.material();
      if (m?.htmlContent) {
        this.prepareContent(m.htmlContent);
      }
    });
  }

  ngOnInit(): void {
    document.addEventListener('fullscreenchange', this.fullscreenChangeHandler);

    const materialId = this.route.snapshot.paramMap.get('id');
    if (materialId) {
      this.loadMaterial(materialId);
    } else {
      this.error.set('Keine Material-ID angegeben');
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.fullscreenChangeHandler);
  }

  private loadMaterial(materialId: string): void {
    this.materialService.getMaterialById(materialId).subscribe({
      next: (material) => {
        if (material) {
          this.material.set(material);
          this.prepareContent(material.htmlContent);

          // Increment view count
          this.materialService.incrementViewCount(materialId);

          // Update last accessed
          const userId = this.currentUser()?.uid;
          if (userId) {
            this.participantService.updateLastAccessed(userId, materialId).catch(console.error);
          }
        } else {
          this.error.set('Lernunterlage nicht gefunden');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading material:', err);
        this.error.set('Fehler beim Laden der Lernunterlage');
        this.isLoading.set(false);
      }
    });
  }

  private prepareContent(htmlContent: string): void {
    // Sanitize HTML with DOMPurify
    const sanitized = DOMPurify.sanitize(htmlContent, {
      WHOLE_DOCUMENT: true,
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'onclick']
    });

    // Inject theme support styles
    const themedContent = this.injectThemeSupport(sanitized);

    // Use srcdoc-compatible format
    this.sanitizedContent.set(this.sanitizer.bypassSecurityTrustHtml(themedContent));
  }

  private injectThemeSupport(html: string): string {
    const isDark = this.currentTheme() === 'dark';

    const themeStyles = `
      <style id="injected-theme-styles">
        :root {
          --injected-bg: ${isDark ? '#1a1a2e' : '#ffffff'};
          --injected-text: ${isDark ? '#e0e0e0' : '#333333'};
          --injected-surface: ${isDark ? '#252540' : '#f8f9fa'};
          --injected-border: ${isDark ? '#3a3a5a' : '#e0e0e0'};
        }
        html, body {
          background-color: var(--bg, var(--injected-bg)) !important;
          color: var(--text, var(--injected-text)) !important;
        }
        /* Support for dark-mode class in uploaded HTML */
        ${isDark ? 'html { class: dark-mode; } body.dark-mode, html.dark-mode body { background-color: var(--bg, #1a1a2e) !important; }' : ''}
      </style>
      <script>
        // Apply dark mode class if needed
        ${isDark ? "document.documentElement.classList.add('dark-mode'); document.body.classList.add('dark-mode');" : "document.documentElement.classList.remove('dark-mode'); document.body.classList.remove('dark-mode');"}
      </script>
    `;

    // Insert before </head> or at the beginning
    if (html.includes('</head>')) {
      return html.replace('</head>', `${themeStyles}</head>`);
    } else if (html.includes('<body')) {
      return html.replace('<body', `${themeStyles}<body`);
    }
    return themeStyles + html;
  }

  toggleFullscreen(): void {
    const viewerElement = document.querySelector('.material-viewer-container');
    if (!viewerElement) return;

    if (!document.fullscreenElement) {
      viewerElement.requestFullscreen().catch(err => {
        console.error('Error entering fullscreen:', err);
        this.toastService.error('Vollbildmodus nicht verfügbar');
      });
    } else {
      document.exitFullscreen();
    }
  }

  editMaterial(): void {
    const m = this.material();
    if (m) {
      this.router.navigate(['/lernen/material-editor', m.id]);
    }
  }

  goBack(): void {
    this.router.navigate(['/lernen/materials']);
  }

  async copyJoinCode(): Promise<void> {
    const m = this.material();
    if (!m?.joinCode) {
      this.toastService.warning('Kein Beitritts-Code verfügbar');
      return;
    }

    try {
      await navigator.clipboard.writeText(m.joinCode);
      this.toastService.success('Code kopiert: ' + m.joinCode);
    } catch (err) {
      this.toastService.error('Kopieren fehlgeschlagen');
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
}
