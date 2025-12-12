import { ProgressLevel } from './progress.model';

export interface UserDeckProgress {
  userId: string;
  deckId: string;
  lastStudyAt: Date;
  completionRate: number; // 0-100
}

export interface CardProgress {
  cardId: string;
  level: ProgressLevel; // 0-3 (same as quiz system)
  lastAttemptAt: Date;
  correctCount: number;
  incorrectCount: number;
}

export interface DeckProgressSummary {
  totalCards: number;
  level0Count: number;
  level1Count: number;
  level2Count: number;
  level3Count: number;
  completionRate: number;
  lastStudyAt?: Date;
}
