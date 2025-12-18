import { Injectable, computed, effect, signal, inject } from '@angular/core';
import { Theme, ThemeService } from './theme.service';
import { adjustHexLightness, hexToRgb, normalizeHexColor, rgbToCss } from '../../shared/utils/color-utils';

export type ColorThemeSource = 'preset' | 'custom' | 'community';

export interface ThemePalette {
  primary: string;
  accent: string;
  onPrimary?: string;
  onAccent?: string;
  onGradient?: string;

  background?: string;
  surface?: string;
  surfaceElevated?: string;

  textPrimary?: string;
  textSecondary?: string;
  textDisabled?: string;
  textHint?: string;

  border?: string;
  divider?: string;

  editorBackground?: string;
  editorLineNumbers?: string;
}

export interface StoredColorThemeV1 {
  version: 1;
  id: string;
  name: string;
  source: Exclude<ColorThemeSource, 'preset'>;
  originId?: string;
  palette: ThemePalette;
  darkPalette?: Partial<ThemePalette>;
}

export interface ColorTheme {
  id: string;
  name: string;
  labelKey?: string;
  source: ColorThemeSource;
  originId?: string;
  palette?: ThemePalette;
  darkPalette?: Partial<ThemePalette>;
}

type CssVarMap = Record<string, string>;

const STORAGE_ACTIVE_THEME_ID = 'quiz-app-color-theme';
const STORAGE_CUSTOM_THEMES = 'quiz-app-custom-color-themes';

const DEFAULT_THEME_ID = 'default';

const PRESET_THEMES: readonly ColorTheme[] = [
  {
    id: 'default',
    name: 'Default',
    labelKey: 'settings.themes.default',
    source: 'preset'
  },
  {
    id: 'ocean',
    name: 'Ocean',
    labelKey: 'settings.themes.ocean',
    source: 'preset',
    palette: {
      primary: '#0277bd',
      accent: '#00bcd4',
      background: '#f2fbff'
    },
    darkPalette: {
      background: '#07141c',
      surface: '#0d1e28',
      surfaceElevated: '#102633'
    }
  },
  {
    id: 'forest',
    name: 'Forest',
    labelKey: 'settings.themes.forest',
    source: 'preset',
    palette: {
      primary: '#2e7d32',
      accent: '#8bc34a',
      background: '#f6fff6'
    },
    darkPalette: {
      background: '#06140a',
      surface: '#0b1d0f',
      surfaceElevated: '#102717'
    }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    labelKey: 'settings.themes.sunset',
    source: 'preset',
    palette: {
      primary: '#ec407a',
      accent: '#ff7043',
      background: '#fff6f2'
    },
    darkPalette: {
      background: '#1a0b10',
      surface: '#241018',
      surfaceElevated: '#2e1520'
    }
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    labelKey: 'settings.themes.highContrast',
    source: 'preset',
    palette: {
      primary: '#00e5ff',
      accent: '#ffea00',
      onPrimary: '#000000',
      onAccent: '#000000',
      onGradient: '#000000',
      background: '#000000',
      surface: '#0b0b0b',
      surfaceElevated: '#141414',
      textPrimary: '#ffffff',
      textSecondary: '#f5f5f5',
      textDisabled: '#d6d6d6',
      textHint: '#d6d6d6',
      border: 'rgba(255, 255, 255, 0.65)',
      divider: 'rgba(255, 255, 255, 0.35)',
      editorBackground: '#0b0b0b',
      editorLineNumbers: '#e0e0e0'
    },
    darkPalette: {
      background: '#000000',
      surface: '#0b0b0b',
      surfaceElevated: '#141414'
    }
  }
] as const;

const COMMUNITY_THEMES: readonly Omit<StoredColorThemeV1, 'id'>[] = [
  {
    version: 1,
    name: 'Midnight Neon',
    source: 'community',
    originId: 'midnight-neon',
    palette: {
      primary: '#00e5ff',
      accent: '#ff4081',
      background: '#0b1020',
      surface: '#121a2f',
      surfaceElevated: '#192544'
    },
    darkPalette: {
      background: '#050812',
      surface: '#0b1020',
      surfaceElevated: '#121a2f'
    }
  },
  {
    version: 1,
    name: 'Paper Mint',
    source: 'community',
    originId: 'paper-mint',
    palette: {
      primary: '#00897b',
      accent: '#7c4dff',
      background: '#fbfffd',
      surface: '#ffffff',
      surfaceElevated: '#ffffff'
    }
  },
  {
    version: 1,
    name: 'Cherry Cola',
    source: 'community',
    originId: 'cherry-cola',
    palette: {
      primary: '#b71c1c',
      accent: '#ff6f00',
      background: '#fff7f2',
      surface: '#ffffff',
      surfaceElevated: '#ffffff'
    },
    darkPalette: {
      background: '#140707',
      surface: '#1e0a0a',
      surfaceElevated: '#2a0f0f'
    }
  }
] as const;

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `theme_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

@Injectable({
  providedIn: 'root'
})
export class ColorThemeService {
  private themeService = inject(ThemeService);

  private appliedVarNames = new Set<string>();

  private storedThemesSignal = signal<StoredColorThemeV1[]>(this.loadStoredThemes());
  private activeThemeIdSignal = signal<string>(this.loadActiveThemeId());

  // Public computed signals
  activeThemeId = computed(() => this.activeThemeIdSignal());

  presets = computed(() => PRESET_THEMES);

  customThemes = computed(() => {
    return this.storedThemesSignal();
  });

  communityThemes = computed(() => COMMUNITY_THEMES);

  installedCommunityOriginIds = computed(() => {
    return new Set(
      this.storedThemesSignal()
        .filter((t) => t.source === 'community' && typeof t.originId === 'string')
        .map((t) => t.originId!)
    );
  });

  allThemes = computed<ColorTheme[]>(() => {
    const stored = this.storedThemesSignal().map<ColorTheme>((t) => ({
      id: t.id,
      name: t.name,
      source: t.source,
      originId: t.originId,
      palette: t.palette,
      darkPalette: t.darkPalette
    }));

    return [...PRESET_THEMES, ...stored];
  });

  activeTheme = computed<ColorTheme>(() => {
    const id = this.activeThemeIdSignal();
    return this.allThemes().find((t) => t.id === id) ?? PRESET_THEMES[0];
  });

  constructor() {
    // Persist theme selection
    effect(() => {
      localStorage.setItem(STORAGE_ACTIVE_THEME_ID, this.activeThemeIdSignal());
    });

    // Persist custom themes
    effect(() => {
      localStorage.setItem(STORAGE_CUSTOM_THEMES, JSON.stringify(this.storedThemesSignal()));
    });

    // Apply variables whenever palette or light/dark mode changes
    effect(() => {
      const mode = this.themeService.theme();
      const active = this.activeTheme();
      this.applyColorTheme(active, mode);
    });
  }

  setActiveThemeId(id: string): void {
    if (this.allThemes().some((t) => t.id === id)) {
      this.activeThemeIdSignal.set(id);
      return;
    }
    this.activeThemeIdSignal.set(DEFAULT_THEME_ID);
  }

  resetToDefault(): void {
    this.activeThemeIdSignal.set(DEFAULT_THEME_ID);
  }

  saveCustomTheme(input: { name: string; primary: string; accent: string }): string | null {
    const name = input.name.trim();
    if (!name) return null;

    const primary = normalizeHexColor(input.primary);
    const accent = normalizeHexColor(input.accent);
    if (!primary || !accent) return null;

    const id = generateId();

    const theme: StoredColorThemeV1 = {
      version: 1,
      id,
      name,
      source: 'custom',
      palette: {
        primary,
        accent
      }
    };

    this.storedThemesSignal.update((themes) => [theme, ...themes]);
    this.activeThemeIdSignal.set(id);
    return id;
  }

  updateCustomTheme(id: string, patch: { name?: string; primary?: string; accent?: string }): boolean {
    let didUpdate = false;

    this.storedThemesSignal.update((themes) => {
      return themes.map((t) => {
        if (t.id !== id) return t;

        const nextName = patch.name?.trim();
        const nextPrimary = patch.primary ? normalizeHexColor(patch.primary) : null;
        const nextAccent = patch.accent ? normalizeHexColor(patch.accent) : null;

        didUpdate = true;
        return {
          ...t,
          name: typeof nextName === 'string' && nextName ? nextName : t.name,
          palette: {
            ...t.palette,
            primary: nextPrimary ?? t.palette.primary,
            accent: nextAccent ?? t.palette.accent
          }
        };
      });
    });

    return didUpdate;
  }

  deleteCustomTheme(id: string): void {
    this.storedThemesSignal.update((themes) => themes.filter((t) => t.id !== id));
    if (this.activeThemeIdSignal() === id) {
      this.activeThemeIdSignal.set(DEFAULT_THEME_ID);
    }
  }

  installCommunityTheme(originId: string): string | null {
    const theme = COMMUNITY_THEMES.find((t) => t.originId === originId);
    if (!theme) return null;

    const installed = this.installedCommunityOriginIds();
    if (installed.has(originId)) return null;

    const id = generateId();
    const stored: StoredColorThemeV1 = {
      ...theme,
      id
    };

    this.storedThemesSignal.update((themes) => [stored, ...themes]);
    this.activeThemeIdSignal.set(id);
    return id;
  }

  exportThemeAsJson(id: string): string | null {
    const preset = PRESET_THEMES.find((t) => t.id === id);
    if (preset && preset.palette) {
      const json: StoredColorThemeV1 = {
        version: 1,
        id: preset.id,
        name: preset.name,
        source: 'custom',
        palette: preset.palette,
        darkPalette: preset.darkPalette
      };
      return JSON.stringify(json, null, 2);
    }

    const stored = this.storedThemesSignal().find((t) => t.id === id);
    if (!stored) return null;
    return JSON.stringify(stored, null, 2);
  }

  importThemeFromJson(jsonText: string): string | null {
    const parsed = safeJsonParse<unknown>(jsonText);
    if (!parsed || typeof parsed !== 'object') return null;

    const obj = parsed as Partial<StoredColorThemeV1>;
    if (obj.version !== 1) return null;
    if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
    if (!obj.palette || typeof obj.palette !== 'object') return null;

    const palette = obj.palette as Partial<ThemePalette>;
    const primary = typeof palette.primary === 'string' ? normalizeHexColor(palette.primary) : null;
    const accent = typeof palette.accent === 'string' ? normalizeHexColor(palette.accent) : null;
    if (!primary || !accent) return null;

    const id = generateId();

    const stored: StoredColorThemeV1 = {
      version: 1,
      id,
      name: obj.name.trim(),
      source: 'custom',
      originId: typeof obj.originId === 'string' ? obj.originId : undefined,
      palette: {
        ...palette,
        primary,
        accent
      },
      darkPalette: obj.darkPalette && typeof obj.darkPalette === 'object' ? (obj.darkPalette as Partial<ThemePalette>) : undefined
    };

    this.storedThemesSignal.update((themes) => [stored, ...themes]);
    this.activeThemeIdSignal.set(id);
    return id;
  }

  getPreviewGradient(theme: ColorTheme, mode: Theme = 'light'): string {
    const palette = this.mergePalette(theme, mode);
    const primary = palette.primary;
    const accent = palette.accent;
    return `linear-gradient(135deg, ${primary}, ${accent})`;
  }

  private loadActiveThemeId(): string {
    const stored = localStorage.getItem(STORAGE_ACTIVE_THEME_ID);
    if (stored && typeof stored === 'string') return stored;
    return DEFAULT_THEME_ID;
  }

  private loadStoredThemes(): StoredColorThemeV1[] {
    const stored = safeJsonParse<StoredColorThemeV1[]>(localStorage.getItem(STORAGE_CUSTOM_THEMES));
    if (!stored || !Array.isArray(stored)) return [];

    const valid: StoredColorThemeV1[] = [];
    for (const item of stored) {
      if (!item || typeof item !== 'object') continue;
      if ((item as StoredColorThemeV1).version !== 1) continue;
      if (typeof (item as StoredColorThemeV1).id !== 'string') continue;
      if (typeof (item as StoredColorThemeV1).name !== 'string') continue;
      if ((item as StoredColorThemeV1).source !== 'custom' && (item as StoredColorThemeV1).source !== 'community') continue;
      const palette = (item as StoredColorThemeV1).palette;
      if (!palette || typeof palette !== 'object') continue;
      const primary = normalizeHexColor((palette as ThemePalette).primary);
      const accent = normalizeHexColor((palette as ThemePalette).accent);
      if (!primary || !accent) continue;

      valid.push({
        ...(item as StoredColorThemeV1),
        palette: {
          ...(palette as ThemePalette),
          primary,
          accent
        }
      });
    }

    return valid;
  }

  private applyColorTheme(theme: ColorTheme, mode: Theme): void {
    const root = document.documentElement;

    // Clear previous variables
    for (const name of this.appliedVarNames) {
      root.style.removeProperty(name);
    }
    this.appliedVarNames.clear();

    // Default theme means "use CSS defaults"
    if (theme.id === DEFAULT_THEME_ID || !theme.palette) {
      root.removeAttribute('data-color-theme');
      return;
    }

    root.setAttribute('data-color-theme', theme.id);

    const vars = this.computeCssVars(theme, mode);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
      this.appliedVarNames.add(name);
    }
  }

  private mergePalette(theme: ColorTheme, mode: Theme): ThemePalette {
    const base: ThemePalette = theme.palette
      ? { ...theme.palette }
      : { primary: '#2196f3', accent: '#ff9800' };

    if (mode === 'dark' && theme.darkPalette) {
      return { ...base, ...theme.darkPalette };
    }

    return base;
  }

  private computeCssVars(theme: ColorTheme, mode: Theme): CssVarMap {
    const palette = this.mergePalette(theme, mode);

    const primary = normalizeHexColor(palette.primary) ?? '#2196f3';
    const accent = normalizeHexColor(palette.accent) ?? '#ff9800';

    const primaryWasExplicitForDark = mode === 'dark' && typeof theme.darkPalette?.primary === 'string';
    const accentWasExplicitForDark = mode === 'dark' && typeof theme.darkPalette?.accent === 'string';

    const modePrimaryBase =
      mode === 'dark' && !primaryWasExplicitForDark ? adjustHexLightness(primary, 0.18) ?? primary : primary;
    const modeAccentBase =
      mode === 'dark' && !accentWasExplicitForDark ? adjustHexLightness(accent, 0.18) ?? accent : accent;

    const primaryLight = adjustHexLightness(modePrimaryBase, 0.16) ?? modePrimaryBase;
    const primaryDark = adjustHexLightness(modePrimaryBase, -0.12) ?? modePrimaryBase;
    const accentLight = adjustHexLightness(modeAccentBase, 0.16) ?? modeAccentBase;
    const accentDark = adjustHexLightness(modeAccentBase, -0.12) ?? modeAccentBase;

    const primaryRgb = hexToRgb(modePrimaryBase);
    const accentRgb = hexToRgb(modeAccentBase);

    const vars: CssVarMap = {
      '--color-primary': modePrimaryBase,
      '--color-primary-light': primaryLight,
      '--color-primary-dark': primaryDark,
      '--color-accent': modeAccentBase,
      '--color-accent-light': accentLight,
      '--color-accent-dark': accentDark
    };

    if (primaryRgb) vars['--color-primary-rgb'] = rgbToCss(primaryRgb);
    if (accentRgb) vars['--color-accent-rgb'] = rgbToCss(accentRgb);

    if (palette.background) vars['--color-background'] = palette.background;
    if (palette.surface) vars['--color-surface'] = palette.surface;
    if (palette.surfaceElevated) vars['--color-surface-elevated'] = palette.surfaceElevated;

    if (palette.textPrimary) vars['--color-text-primary'] = palette.textPrimary;
    if (palette.textSecondary) vars['--color-text-secondary'] = palette.textSecondary;
    if (palette.textDisabled) vars['--color-text-disabled'] = palette.textDisabled;
    if (palette.textHint) vars['--color-text-hint'] = palette.textHint;

    const shouldComputeOnColors = theme.source !== 'preset';

    const explicitOnPrimary = typeof palette.onPrimary === 'string' ? normalizeHexColor(palette.onPrimary) : null;
    const explicitOnAccent = typeof palette.onAccent === 'string' ? normalizeHexColor(palette.onAccent) : null;
    const explicitOnGradient = typeof palette.onGradient === 'string' ? normalizeHexColor(palette.onGradient) : null;

    const computedOnPrimary = shouldComputeOnColors ? this.pickReadableTextColor(modePrimaryBase) : null;
    const computedOnAccent = shouldComputeOnColors ? this.pickReadableTextColor(modeAccentBase) : null;
    const computedOnGradient = shouldComputeOnColors ? this.pickReadableTextColorForGradient(modePrimaryBase, modeAccentBase) : null;

    const onPrimary = explicitOnPrimary ?? computedOnPrimary;
    const onAccent = explicitOnAccent ?? computedOnAccent;
    const onGradient = explicitOnGradient ?? computedOnGradient;

    if (onPrimary) vars['--color-on-primary'] = onPrimary;
    if (onAccent) vars['--color-on-accent'] = onAccent;
    if (onGradient) vars['--color-on-gradient'] = onGradient;

    if (palette.border) vars['--color-border'] = palette.border;
    if (palette.divider) vars['--color-divider'] = palette.divider;

    if (palette.editorBackground) vars['--editor-background'] = palette.editorBackground;
    if (palette.editorLineNumbers) vars['--editor-line-numbers'] = palette.editorLineNumbers;

    return vars;
  }

  private pickReadableTextColor(backgroundHex: string): string | null {
    const rgb = hexToRgb(backgroundHex);
    if (!rgb) return null;

    const lum = this.relativeLuminance(rgb.r, rgb.g, rgb.b);
    const contrastBlack = (lum + 0.05) / 0.05;
    const contrastWhite = 1.05 / (lum + 0.05);

    return contrastBlack >= contrastWhite ? '#000000' : '#ffffff';
  }

  private pickReadableTextColorForGradient(primaryHex: string, accentHex: string): string | null {
    const p = hexToRgb(primaryHex);
    const a = hexToRgb(accentHex);
    if (!p || !a) return null;

    const pLum = this.relativeLuminance(p.r, p.g, p.b);
    const aLum = this.relativeLuminance(a.r, a.g, a.b);

    const blackScore = Math.min((pLum + 0.05) / 0.05, (aLum + 0.05) / 0.05);
    const whiteScore = Math.min(1.05 / (pLum + 0.05), 1.05 / (aLum + 0.05));

    return blackScore >= whiteScore ? '#000000' : '#ffffff';
  }

  private relativeLuminance(r: number, g: number, b: number): number {
    const srgb = [r, g, b].map((v) => v / 255);
    const [rl, gl, bl] = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }
}
