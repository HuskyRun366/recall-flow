import { Quiz } from './quiz.model';
import { FlashcardDeck } from './flashcard-deck.model';
import { LearningMaterial } from './learning-material.model';
import { ContentType } from './review.model';
import { MarketplaceTheme } from './marketplace-theme.model';

export type TopChartType = 'trending' | 'popular' | 'recent';

export interface MarketplaceItem {
  type: ContentType;
  content: Quiz | FlashcardDeck | LearningMaterial | MarketplaceTheme;
  ownerDisplayName?: string;
}

export interface FeaturedContentConfig {
  items: Array<{
    id: string;
    type: ContentType;
  }>;
  updatedAt: Date;
}
