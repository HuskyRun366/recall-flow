export type ProgressLevel = 0 | 1 | 2 | 3;

export interface AdaptiveProgress {
  easeFactor?: number; // SM-2 ease factor (default 2.5)
  intervalDays?: number; // Current review interval in days
  repetitions?: number; // SM-2 repetition count
  nextReviewAt?: Date; // Next scheduled review date
  lastQuality?: number; // SM-2 quality (0-5)
  lastResponseMs?: number | null; // Last response time in ms
  difficulty?: number; // 0 (easy) - 1 (hard)
}

export interface QuestionProgress extends AdaptiveProgress {
  questionId: string;
  level: ProgressLevel; // 0: not trained, 1: once, 2: twice, 3: perfectly
  lastAttemptAt: Date;
  correctCount: number;
  incorrectCount: number;
}

export interface UserQuizProgress {
  userId: string;
  quizId: string;
  lastAttemptAt: Date;
  completionRate: number; // 0-100
  nextReviewAt?: Date;
  dueCount?: number;
}

export interface ProgressSummary {
  notTrained: number;
  onceTrained: number;
  twiceTrained: number;
  perfectlyTrained: number;
}
