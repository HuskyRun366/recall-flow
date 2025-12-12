export type QuestionType = 'multiple-choice' | 'ordering' | 'matching';

export interface MultipleChoiceOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface OrderingItem {
  id: string;
  text: string;
  correctOrder: number;
}

export interface MatchingChoice {
  id: string;
  text: string;
}

export interface MatchingPair {
  id: string;
  leftText: string;
  correctChoiceId: string;
}

export interface Question {
  id: string;
  quizId: string; // Reference to parent quiz
  orderIndex: number; // For ordering questions in quiz
  type: QuestionType;
  questionText: string;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;

  // For multiple choice questions
  options?: MultipleChoiceOption[];

  // For ordering questions
  orderItems?: OrderingItem[];

  // For matching questions
  matchingChoices?: MatchingChoice[];
  matchingPairs?: MatchingPair[];
}

// Specific question types for type safety
export interface MultipleChoiceQuestion extends Question {
  type: 'multiple-choice';
  options: MultipleChoiceOption[];
}

export interface OrderingQuestion extends Question {
  type: 'ordering';
  orderItems: OrderingItem[];
}

export interface MatchingQuestion extends Question {
  type: 'matching';
  matchingChoices: MatchingChoice[];
  matchingPairs: MatchingPair[];
}
