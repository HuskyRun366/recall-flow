export type ProgressLevel = 0 | 1 | 2 | 3;

export interface QuestionProgress {
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
}

export interface ProgressSummary {
  notTrained: number;
  onceTrained: number;
  twiceTrained: number;
  perfectlyTrained: number;
}
