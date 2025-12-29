export type QuizVisibility = 'public' | 'private' | 'unlisted';

// Shared types for marketplace filtering
export type ContentCategory =
  | 'math'
  | 'science'
  | 'languages'
  | 'history'
  | 'geography'
  | 'technology'
  | 'arts'
  | 'business'
  | 'health'
  | 'other';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface QuizMetadata {
  totalParticipants: number;
  totalCompletions: number;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  ownerDisplayName?: string; // Denormalized for display
  ownerPhotoURL?: string; // Denormalized for display
  visibility: QuizVisibility;
  joinCode?: string; // For unlisted quizzes
  questionCount: number; // Denormalized for display
  createdAt: Date;
  updatedAt: Date;
  metadata: QuizMetadata;
  // Marketplace fields
  category?: ContentCategory;
  difficulty?: DifficultyLevel;
  language?: string; // ISO 639-1 code: 'de', 'en', 'es', 'fr'
  averageRating?: number; // 0-5, denormalized from reviews
  ratingCount?: number;
}
