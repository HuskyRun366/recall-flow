export interface QuestionAnalyticsStat {
  quizId: string;
  questionId: string;
  orderIndex: number;
  attempts: number;
  correct: number;
  incorrect: number;
  totalResponseMs: number;
  lastAttemptAt?: Date;
}

export interface QuizAnalyticsSummary {
  totalUsers: number;
  completions: number;
  averageCompletionRate: number;
}
