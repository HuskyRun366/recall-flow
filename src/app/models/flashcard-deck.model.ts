import { ContentCategory, DifficultyLevel, ForkedFromInfo } from './quiz.model';

export interface FlashcardDeck {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  visibility: 'public' | 'private' | 'unlisted';
  joinCode?: string; // For unlisted decks
  cardCount: number; // Denormalized for display
  tags: string[]; // For categorization/filtering
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalStudents: number; // Number of people studying this deck
    totalCompletions: number;
  };
  // Marketplace fields
  category?: ContentCategory;
  difficulty?: DifficultyLevel;
  language?: string; // ISO 639-1 code: 'de', 'en', 'es', 'fr'
  forkedFrom?: ForkedFromInfo;
  averageRating?: number; // 0-5, denormalized from reviews
  ratingCount?: number;
}
