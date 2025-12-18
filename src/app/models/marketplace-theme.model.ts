import { ThemePalette } from '../core/services/color-theme.service';

export type ThemeVisibility = 'public' | 'private';

/**
 * Theme document used in the Discover marketplace.
 *
 * Note: This is separate from the locally stored theme format (StoredColorThemeV1),
 * because marketplace items also need metadata + rating fields for cards/sorting.
 */
export interface MarketplaceTheme {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  visibility: ThemeVisibility;
  createdAt: Date;
  updatedAt: Date;
  originId?: string;
  palette: ThemePalette;
  darkPalette?: Partial<ThemePalette>;
  metadata: {
    totalInstalls: number;
  };
  averageRating?: number;
  ratingCount?: number;
}
