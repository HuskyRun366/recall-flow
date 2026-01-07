import { Component, OnInit, OnDestroy, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
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
  imports: [CommonModule, RouterModule, TranslateModule, SkeletonLoaderComponent],
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

  private isPseudoFullscreen = false;
  private previousBodyOverflow: string | null = null;
  private previousHtmlOverflow: string | null = null;

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
    if (this.isPseudoFullscreen) return;
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  private readonly UNTRUSTED_MATERIAL_WARNING_KEY_PREFIX = 'recallflow:material-untrusted-warning:v1:';

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
    if (this.isPseudoFullscreen) {
      this.setPseudoFullscreen(false);
    }
  }

  private loadMaterial(materialId: string): void {
    this.materialService.getMaterialById(materialId).subscribe({
      next: (material) => {
        if (material) {
          if (!this.confirmUntrustedMaterialIfNeeded(materialId, material)) {
            this.isLoading.set(false);
            this.goBack();
            return;
          }

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

  private confirmUntrustedMaterialIfNeeded(materialId: string, material: LearningMaterial): boolean {
    const visibility = material.visibility;
    if (visibility !== 'public' && visibility !== 'unlisted') {
      return true;
    }

    const userId = this.currentUser()?.uid;
    if (userId && userId === material.ownerId) {
      return true;
    }

    const warningKey = this.getUntrustedMaterialWarningKey(materialId);
    try {
      if (localStorage.getItem(warningKey) === '1') {
        return true;
      }
    } catch {
      // If storage isn't available, fall back to showing the warning each time.
    }

    const label = visibility === 'public' ? 'öffentliche' : 'nicht gelistete';
    const proceed = confirm(
      `Sicherheitshinweis\n\nDu öffnest eine ${label} Lernunterlage. Sie kann interaktiven Code (JavaScript) enthalten.\n\nÖffne sie nur, wenn du dem Ersteller vertraust.\n\nFortfahren?`
    );

    if (!proceed) {
      return false;
    }

    try {
      localStorage.setItem(warningKey, '1');
    } catch {
      // Ignore storage failures (warning will be shown again next time).
    }

    return true;
  }

  private getUntrustedMaterialWarningKey(materialId: string): string {
    return `${this.UNTRUSTED_MATERIAL_WARNING_KEY_PREFIX}${materialId}`;
  }

  private prepareContent(htmlContent: string): void {
    // NOTE: We intentionally do not sanitize away scripts here because learning materials
    // are meant to be interactive. Security is handled via iframe sandboxing (no same-origin).
    const cleanedOriginal = this.stripInvalidSourceMappingUrls(htmlContent);
    const runtimeInjected = this.injectRuntimeSupport(cleanedOriginal);
    const themedContent = this.injectThemeSupport(runtimeInjected);
    const cleanedContent = this.stripInvalidSourceMappingUrls(themedContent);

    // Use srcdoc-compatible format
    this.sanitizedContent.set(this.sanitizer.bypassSecurityTrustHtml(cleanedContent));
  }

  /**
   * Firefox DevTools can throw noisy source-map errors for about:srcdoc when the embedded document
   * contains empty or "null" sourceMappingURL hints. They are non-functional anyway, so strip them.
   */
  private stripInvalidSourceMappingUrls(html: string): string {
    return html
      // JS single-line sourcemap hints (empty or null only)
      .replace(/\/\/[#@]\s*sourceMappingURL\s*=\s*(?:null)?\s*(?=\r?\n|$)/g, '')
      // CSS/JS block sourcemap hints (empty or null only)
      .replace(/\/\*#\s*sourceMappingURL\s*=\s*(?:null)?\s*\*\//g, '');
  }

  /**
   * Provide lightweight runtime shims so common patterns (like localStorage) don't crash in sandboxed iframes.
   * This preserves interactivity while keeping a safer sandbox configuration (no same-origin).
   */
  private injectRuntimeSupport(html: string): string {
    if (html.includes('id="recallflow-material-runtime"')) {
      return html;
    }

    const runtimeScript = `
      <script id="recallflow-material-runtime">
        (function () {
          function createMemoryStorage() {
            let data = Object.create(null);

            return {
              getItem: function (key) {
                key = String(key);
                return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
              },
              setItem: function (key, value) {
                data[String(key)] = String(value);
              },
              removeItem: function (key) {
                delete data[String(key)];
              },
              clear: function () {
                data = Object.create(null);
              },
              key: function (index) {
                return Object.keys(data)[index] || null;
              },
              get length() {
                return Object.keys(data).length;
              }
            };
          }

          function ensureStorage(name) {
            try {
              const storage = window[name];
              if (!storage) throw new Error('missing');

              const testKey = '__rf_test__';
              storage.setItem(testKey, '1');
              storage.removeItem(testKey);
              return;
            } catch (e) {
              const fallback = createMemoryStorage();
              try { window[name] = fallback; } catch (_) {}
              try {
                Object.defineProperty(window, name, {
                  value: fallback,
                  configurable: true,
                  enumerable: true,
                  writable: true
                });
              } catch (_) {}
            }
          }

          ensureStorage('localStorage');
          ensureStorage('sessionStorage');

          // Some browsers keep iframe scroll position when srcdoc is updated.
          // Ensure materials always start at the top when opened.
          function resetScroll() {
            try {
              window.scrollTo(0, 0);
            } catch (_) {}
          }

          if (document.readyState === 'complete') {
            resetScroll();
          } else {
            window.addEventListener('load', function () {
              resetScroll();
              try { requestAnimationFrame(resetScroll); } catch (_) {}
            }, { once: true });
          }
        })();
      </script>
    `;

    if (html.includes('</head>')) {
      return html.replace('</head>', `${runtimeScript}</head>`);
    }

    if (html.includes('<body')) {
      return html.replace('<body', `${runtimeScript}<body`);
    }

    return runtimeScript + html;
  }

  private injectThemeSupport(html: string): string {
    const isDark = this.currentTheme() === 'dark';

    const supportsThemeVars = /var\(--bg\b|--bg\s*:|var\(--text\b|--text\s*:|var\(--surface\b|--surface\s*:|var\(--border\b|--border\s*:/i.test(html);
    const supportsDarkModeClass = /\bdark-mode\b/i.test(html);

    // If the material doesn't appear to support theming hooks, don't override anything.
    if (!supportsThemeVars && !supportsDarkModeClass) {
      return html;
    }

    const themeStyles = `
      <style id="injected-theme-styles">
        ${supportsThemeVars ? `
        :root {
          --bg: ${isDark ? '#1a1a2e' : '#ffffff'};
          --text: ${isDark ? '#e0e0e0' : '#333333'};
          --surface: ${isDark ? '#252540' : '#f8f9fa'};
          --border: ${isDark ? '#3a3a5a' : '#e0e0e0'};
        }` : ''}
        ${isDark ? 'html { color-scheme: dark; }' : ''}
      </style>
      <script>
        (function () {
          const enableDarkMode = ${isDark ? 'true' : 'false'};

          function applyDarkModeClasses() {
            ${supportsDarkModeClass ? `
            document.documentElement.classList.toggle('dark-mode', enableDarkMode);
            const body = document.body;
            if (body) body.classList.toggle('dark-mode', enableDarkMode);
            ` : ''}
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyDarkModeClasses, { once: true });
          } else {
            applyDarkModeClasses();
          }
        })();
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
    const viewerElement = document.querySelector('.material-viewer-container') as HTMLElement | null;
    if (!viewerElement) return;

    if (this.isPseudoFullscreen) {
      this.setPseudoFullscreen(false);
      return;
    }

    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      return;
    }

    if (!this.canUseNativeFullscreen(viewerElement)) {
      this.setPseudoFullscreen(true);
      return;
    }

    viewerElement.requestFullscreen().catch(err => {
      console.error('Error entering fullscreen:', err);
      this.toastService.error('Vollbildmodus nicht verfügbar');
    });
  }

  private canUseNativeFullscreen(element: HTMLElement): boolean {
    if (typeof element.requestFullscreen !== 'function') {
      return false;
    }

    if ('fullscreenEnabled' in document) {
      return document.fullscreenEnabled;
    }

    return true;
  }

  private shouldLockScrollInPseudoFullscreen(): boolean {
    return !this.isIOS();
  }

  private isIOS(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }

    const ua = navigator.userAgent || '';
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS = ua.includes('Macintosh') && (navigator.maxTouchPoints ?? 0) > 1;

    return isIOSDevice || isIPadOS;
  }

  private setPseudoFullscreen(enabled: boolean): void {
    this.isPseudoFullscreen = enabled;
    this.isFullscreen.set(enabled);

    const body = document.body;
    const html = document.documentElement;
    const shouldLockScroll = this.shouldLockScrollInPseudoFullscreen();

    if (enabled) {
      if (shouldLockScroll) {
        this.previousBodyOverflow = body.style.overflow;
        this.previousHtmlOverflow = html.style.overflow;
        body.style.overflow = 'hidden';
        html.style.overflow = 'hidden';
      }
      return;
    }

    if (shouldLockScroll) {
      if (this.previousBodyOverflow !== null) {
        body.style.overflow = this.previousBodyOverflow;
      } else {
        body.style.removeProperty('overflow');
      }

      if (this.previousHtmlOverflow !== null) {
        html.style.overflow = this.previousHtmlOverflow;
      } else {
        html.style.removeProperty('overflow');
      }
    }

    this.previousBodyOverflow = null;
    this.previousHtmlOverflow = null;
  }

  editMaterial(): void {
    const m = this.material();
    if (m) {
      this.router.navigate(['/lernen/material-editor', m.id]);
    }
  }

  goBack(): void {
    const m = this.material();
    if (m) {
      this.router.navigate(['/lernen/material', m.id]);
    } else {
      this.router.navigate(['/lernen/materials']);
    }
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
