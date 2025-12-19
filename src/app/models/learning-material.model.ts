import { ContentCategory, DifficultyLevel } from './quiz.model';

export interface LearningMaterial {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  visibility: 'public' | 'private' | 'unlisted';
  joinCode?: string; // For unlisted materials
  htmlContent: string; // The HTML content (50-150KB)
  contentSize: number; // Size in bytes for display
  tags: string[]; // For categorization/filtering
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalStudents: number; // Number of people with access
    totalViews: number;
  };
  // Marketplace fields
  category?: ContentCategory;
  difficulty?: DifficultyLevel;
  language?: string; // ISO 639-1 code: 'de', 'en', 'es', 'fr'
  averageRating?: number; // 0-5, denormalized from reviews
  ratingCount?: number;
}
