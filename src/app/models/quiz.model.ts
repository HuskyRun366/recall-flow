export type QuizVisibility = 'public' | 'private' | 'unlisted';

export interface QuizMetadata {
  totalParticipants: number;
  totalCompletions: number;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  visibility: QuizVisibility;
  joinCode?: string; // For unlisted quizzes
  questionCount: number; // Denormalized for display
  createdAt: Date;
  updatedAt: Date;
  metadata: QuizMetadata;
}
