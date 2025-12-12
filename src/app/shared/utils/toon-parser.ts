import { Quiz, Question, QuestionType, MultipleChoiceOption, OrderingItem, QuizVisibility } from '../../models';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedToon {
  quiz: Partial<Quiz>;
  questions: Question[];
}

export class ToonParser {
  private static currentLineNumber = 0;

  /**
   * Parse TOON format string into Quiz object and Questions array
   * @param toonString TOON formatted string
   * @returns Object with parsed Quiz and Questions
   */
  static parse(toonString: string): ParsedToon {
    // Keep track of original line numbers
    const allLines = toonString.split('\n');
    const processedLines: Array<{ content: string; lineNumber: number }> = [];

    // Filter lines but preserve line numbers
    allLines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        processedLines.push({
          content: trimmed,
          lineNumber: index + 1 // 1-based line numbers for user display
        });
      }
    });

    const quiz: Partial<Quiz> = {
      title: '',
      description: '',
      visibility: 'private' as QuizVisibility,
      questionCount: 0,
      metadata: {
        totalParticipants: 0,
        totalCompletions: 0
      }
    };

    let currentSection: 'metadata' | 'questions' | 'options' | 'orderItems' | 'matchingChoices' | 'matchingPairs' = 'metadata';
    let questionHeaders: string[] = [];
    let optionHeaders: string[] = [];
    let orderItemHeaders: string[] = [];
    let matchingChoiceHeaders: string[] = [];
    let matchingPairHeaders: string[] = [];
    const questionsMap = new Map<number, Partial<Question>>();
    const questionLineNumbers = new Map<number, number>(); // Track line numbers for questions

    for (let i = 0; i < processedLines.length; i++) {
      const { content: line, lineNumber } = processedLines[i];
      this.currentLineNumber = lineNumber;

      // Section detection
      if (line.startsWith('quiz:')) {
        currentSection = 'metadata';
        continue;
      }

      if (line.match(/^questions\[\d+\]\{.+\}:$/)) {
        currentSection = 'questions';
        // Extract headers
        const match = line.match(/\{(.+)\}/);
        if (match) {
          questionHeaders = match[1].split(',').map(h => h.trim());
        }
        continue;
      }

      if (line.match(/^options\[\d+\]\{.+\}:$/)) {
        currentSection = 'options';
        const match = line.match(/\{(.+)\}/);
        if (match) {
          optionHeaders = match[1].split(',').map(h => h.trim());
        }
        continue;
      }

      if (line.match(/^orderItems\[\d+\]\{.+\}:$/)) {
        currentSection = 'orderItems';
        const match = line.match(/\{(.+)\}/);
        if (match) {
          orderItemHeaders = match[1].split(',').map(h => h.trim());
        }
        continue;
      }

      if (line.match(/^matchingChoices\[\d+\]\{.+\}:$/)) {
        currentSection = 'matchingChoices';
        const match = line.match(/\{(.+)\}/);
        if (match) {
          matchingChoiceHeaders = match[1].split(',').map(h => h.trim());
        }
        continue;
      }

      if (line.match(/^matchingPairs\[\d+\]\{.+\}:$/)) {
        currentSection = 'matchingPairs';
        const match = line.match(/\{(.+)\}/);
        if (match) {
          matchingPairHeaders = match[1].split(',').map(h => h.trim());
        }
        continue;
      }

      // Parse content based on current section
      switch (currentSection) {
        case 'metadata':
          this.parseMetadata(line, quiz);
          break;

        case 'questions':
          const orderIndex = this.parseQuestion(line, questionHeaders, questionsMap);
          if (orderIndex !== undefined) {
            questionLineNumbers.set(orderIndex, lineNumber);
          }
          break;

        case 'options':
          this.parseOption(line, optionHeaders, questionsMap);
          break;

        case 'orderItems':
          this.parseOrderItem(line, orderItemHeaders, questionsMap);
          break;

        case 'matchingChoices':
          this.parseMatchingChoice(line, matchingChoiceHeaders, questionsMap);
          break;

        case 'matchingPairs':
          this.parseMatchingPair(line, matchingPairHeaders, questionsMap);
          break;
      }
    }

    // Convert questions map to array and add required fields
    const questions = Array.from(questionsMap.values()).map((q, index) => ({
      ...q,
      id: q.id || uuidv4(),
      quizId: '', // Will be set when creating the quiz
      orderIndex: q.orderIndex !== undefined ? q.orderIndex : index,
      createdAt: new Date(),
      updatedAt: new Date()
    })) as Question[];

    // Resolve pairs whose choices might have been parsed later
    questions.forEach(question => {
      if (question.type === 'matching' && question.matchingPairs && question.matchingChoices) {
        question.matchingPairs = question.matchingPairs.map((pair: any) => {
          const choices = question.matchingChoices!;

          const idxFromPair = pair._correctChoiceIndex;
          const idxFromId = choices.findIndex(c => c.id === pair.correctChoiceId);

          const idx = idxFromPair !== undefined && idxFromPair >= 0 ? idxFromPair : idxFromId;
          const safeIndex = idx >= 0 && idx < choices.length ? idx : 0;

          const choice = choices[safeIndex];
          pair.correctChoiceId = choice ? choice.id : '';

          delete pair._correctChoiceIndex;
          return pair;
        });
      }
    });

    // Update quiz question count
    quiz.questionCount = questions.length;

    // Validate
    this.validate(quiz, questions, questionLineNumbers);

    return { quiz, questions };
  }

  /**
   * Throw an error with line number context
   */
  private static throwError(message: string, lineNumber?: number): never {
    const errorMsg = lineNumber !== undefined
      ? `Line ${lineNumber}: ${message}`
      : message;
    throw new Error(errorMsg);
  }

  private static parseMetadata(line: string, quiz: Partial<Quiz>): void {
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      switch (key.trim()) {
        case 'title':
          quiz.title = value;
          break;
        case 'description':
          quiz.description = value;
          break;
        case 'visibility':
          quiz.visibility = value as QuizVisibility;
          break;
      }
    }
  }

  private static parseQuestion(line: string, headers: string[], questionsMap: Map<number, Partial<Question>>): number | undefined {
    const values = this.parseCsvLine(line);

    const question: Partial<Question> = {
      id: uuidv4(),
      type: 'multiple-choice' as QuestionType,
      questionText: '',
      options: [],
      orderItems: [],
      matchingChoices: [],
      matchingPairs: []
    };

    let orderIndex = questionsMap.size; // Default to current size

    headers.forEach((header, index) => {
      const value = values[index] || '';

      switch (header) {
        case 'orderIndex':
          orderIndex = parseInt(value, 10);
          question.orderIndex = orderIndex;
          break;
        case 'type':
          question.type = value as QuestionType;
          break;
        case 'questionText':
          question.questionText = value;
          break;
      }
    });

    questionsMap.set(orderIndex, question);
    return orderIndex;
  }

  private static parseOption(line: string, headers: string[], questionsMap: Map<number, Partial<Question>>): void {
    const values = this.parseCsvLine(line);

    let questionIndex = 0;
    let text = '';
    let isCorrect = false;

    headers.forEach((header, index) => {
      const value = values[index] || '';

      switch (header) {
        case 'questionId':
        case 'questionIndex':
          questionIndex = parseInt(value, 10);
          break;
        case 'text':
          text = value;
          break;
        case 'isCorrect':
          isCorrect = value.toLowerCase() === 'true';
          break;
      }
    });

    const question = questionsMap.get(questionIndex);
    if (question && question.type === 'multiple-choice') {
      const option: MultipleChoiceOption = {
        id: uuidv4(),
        text,
        isCorrect
      };
      question.options = question.options || [];
      question.options.push(option);
    }
  }

  private static parseOrderItem(line: string, headers: string[], questionsMap: Map<number, Partial<Question>>): void {
    const values = this.parseCsvLine(line);

    let questionIndex = 0;
    let text = '';
    let correctOrder = 0;

    headers.forEach((header, index) => {
      const value = values[index] || '';

      switch (header) {
        case 'questionId':
        case 'questionIndex':
          questionIndex = parseInt(value, 10);
          break;
        case 'text':
          text = value;
          break;
        case 'correctOrder':
          correctOrder = parseInt(value, 10);
          break;
      }
    });

    const question = questionsMap.get(questionIndex);
    if (question && question.type === 'ordering') {
      const item: OrderingItem = {
        id: uuidv4(),
        text,
        correctOrder
      };
      question.orderItems = question.orderItems || [];
      question.orderItems.push(item);
    }
  }

  private static parseMatchingChoice(line: string, headers: string[], questionsMap: Map<number, Partial<Question>>): void {
    const values = this.parseCsvLine(line);

    let questionIndex = 0;
    let text = '';

    headers.forEach((header, index) => {
      const value = values[index] || '';

      switch (header) {
        case 'questionId':
        case 'questionIndex':
          questionIndex = parseInt(value, 10);
          break;
        case 'text':
          text = value;
          break;
      }
    });

    const question = questionsMap.get(questionIndex);
    if (question && question.type === 'matching') {
      const choice = {
        id: uuidv4(),
        text
      };
      question.matchingChoices = question.matchingChoices || [];
      question.matchingChoices.push(choice);
    }
  }

  private static parseMatchingPair(line: string, headers: string[], questionsMap: Map<number, Partial<Question>>): void {
    const values = this.parseCsvLine(line);

    let questionIndex = 0;
    let leftText = '';
    let correctChoiceIndex = 0;

    headers.forEach((header, index) => {
      const value = values[index] || '';

      switch (header) {
        case 'questionId':
        case 'questionIndex':
          questionIndex = parseInt(value, 10);
          break;
        case 'leftText':
          leftText = value;
          break;
        case 'correctChoiceIndex':
          correctChoiceIndex = parseInt(value, 10);
          break;
      }
    });

    const question = questionsMap.get(questionIndex);
    if (question && question.type === 'matching') {
      const choices = question.matchingChoices || [];
      const targetChoice = choices[correctChoiceIndex];
      const pair = {
        id: uuidv4(),
        leftText,
        correctChoiceId: targetChoice ? targetChoice.id : '',
        _correctChoiceIndex: correctChoiceIndex
      };
      question.matchingPairs = question.matchingPairs || [];
      question.matchingPairs.push(pair);
    }
  }

  /**
   * Parse CSV line handling quoted values and commas
   */
  private static parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  private static validate(quiz: Partial<Quiz>, questions: Question[], questionLineNumbers: Map<number, number>): void {
    if (!quiz.title) {
      this.throwError('Quiz title is required', 1);
    }

    if (!questions || questions.length === 0) {
      this.throwError('At least one question is required');
    }

    questions.forEach((question, index) => {
      const lineNumber = questionLineNumbers.get(question.orderIndex);

      if (!question.questionText) {
        this.throwError(`Question ${index + 1}: Question text is required`, lineNumber);
      }

      if (question.type === 'multiple-choice') {
        if (!question.options || question.options.length < 2) {
          this.throwError(
            `Question ${index + 1}: At least 2 options required for multiple choice`,
            lineNumber
          );
        }

        const hasCorrectAnswer = question.options.some(opt => opt.isCorrect);
        if (!hasCorrectAnswer) {
          this.throwError(
            `Question ${index + 1}: At least one option must be marked as correct`,
            lineNumber
          );
        }
      }

      if (question.type === 'ordering') {
        if (!question.orderItems || question.orderItems.length < 2) {
          this.throwError(
            `Question ${index + 1}: At least 2 items required for ordering question`,
            lineNumber
          );
        }
      }

      if (question.type === 'matching') {
        const choices = question.matchingChoices || [];
        const pairs = question.matchingPairs || [];

        if (choices.length < 2) {
          this.throwError(
            `Question ${index + 1}: At least 2 choices required for matching question`,
            lineNumber
          );
        }

        if (pairs.length < 2) {
          this.throwError(
            `Question ${index + 1}: At least 2 pairs required for matching question`,
            lineNumber
          );
        }

        const invalidPairs = pairs.filter(p => !p.correctChoiceId || !choices.some(c => c.id === p.correctChoiceId));
        if (invalidPairs.length > 0) {
          this.throwError(
            `Question ${index + 1}: Each pair must reference a valid choice`,
            lineNumber
          );
        }
      }
    });
  }
}
