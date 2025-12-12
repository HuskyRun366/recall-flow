import { Quiz, Question } from '../../models';

export class ToonStringifier {
  /**
   * Convert Quiz object and Questions to TOON format string
   * @param quiz Quiz object to stringify
   * @param questions Array of Question objects
   * @returns TOON formatted string
   */
  static stringify(quiz: Partial<Quiz>, questions: Question[]): string {
    const lines: string[] = [];

    // Metadata section
    lines.push('quiz:');
    lines.push(`  title: ${quiz.title || ''}`);
    lines.push(`  description: ${quiz.description || ''}`);
    lines.push(`  visibility: ${quiz.visibility || 'private'}`);
    lines.push('');

    if (!questions || questions.length === 0) {
      return lines.join('\n');
    }

    // Questions section (with orderIndex)
    const questionCount = questions.length;
    lines.push(`questions[${questionCount}]{orderIndex,type,questionText}:`);

    questions.forEach((question) => {
      const escapedText = this.escapeValue(question.questionText);
      lines.push(`  ${question.orderIndex},${question.type},${escapedText}`);
    });

    lines.push('');

    // Options section (for multiple choice questions)
    const mcQuestions = questions.filter((q: Question) => q.type === 'multiple-choice');
    if (mcQuestions.length > 0) {
      const totalOptions = mcQuestions.reduce((sum: number, q: Question) => sum + (q.options?.length || 0), 0);
      lines.push(`options[${totalOptions}]{questionIndex,text,isCorrect}:`);

      mcQuestions.forEach((question: Question) => {
        question.options?.forEach((option) => {
          const escapedText = this.escapeValue(option.text);
          lines.push(`  ${question.orderIndex},${escapedText},${option.isCorrect}`);
        });
      });

      lines.push('');
    }

    // OrderItems section (for ordering questions)
    const orderQuestions = questions.filter((q: Question) => q.type === 'ordering');
    if (orderQuestions.length > 0) {
      const totalItems = orderQuestions.reduce((sum: number, q: Question) => sum + (q.orderItems?.length || 0), 0);
      lines.push(`orderItems[${totalItems}]{questionIndex,text,correctOrder}:`);

      orderQuestions.forEach((question: Question) => {
        question.orderItems?.forEach((item) => {
          const escapedText = this.escapeValue(item.text);
          lines.push(`  ${question.orderIndex},${escapedText},${item.correctOrder}`);
        });
      });

      lines.push('');
    }

    // Matching section
    const matchingQuestions = questions.filter((q: Question) => q.type === 'matching');
    if (matchingQuestions.length > 0) {
      const totalChoices = matchingQuestions.reduce((sum: number, q: Question) => sum + ((q as any).matchingChoices?.length || 0), 0);
      const totalPairs = matchingQuestions.reduce((sum: number, q: Question) => sum + ((q as any).matchingPairs?.length || 0), 0);

      lines.push(`matchingChoices[${totalChoices}]{questionIndex,text}:`);
      matchingQuestions.forEach((question: any) => {
        question.matchingChoices?.forEach((choice: any) => {
          const escapedText = this.escapeValue(choice.text);
          lines.push(`  ${question.orderIndex},${escapedText}`);
        });
      });
      lines.push('');

      lines.push(`matchingPairs[${totalPairs}]{questionIndex,leftText,correctChoiceIndex}:`);
      matchingQuestions.forEach((question: any) => {
        question.matchingPairs?.forEach((pair: any) => {
          const escapedLeft = this.escapeValue(pair.leftText);
          const choiceIndex = question.matchingChoices?.findIndex((c: any) => c.id === pair.correctChoiceId) ?? -1;
          lines.push(`  ${question.orderIndex},${escapedLeft},${Math.max(choiceIndex, 0)}`);
        });
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Escape special characters in values for CSV format
   */
  private static escapeValue(value: string): string {
    if (!value) return '';

    // If value contains comma, newline, or quotes, wrap in quotes
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      // Escape existing quotes by doubling them
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return value;
  }

  /**
   * Generate example TOON string for reference
   */
  static getExampleToon(): string {
    return `quiz:
  title: World Capitals
  description: Test your knowledge of capital cities and landmarks.
  visibility: public

questions[4]{orderIndex,type,questionText}:
  0,multiple-choice,What is the capital of Canada?
  1,multiple-choice,Which city is known as the City of Canals?
  2,ordering,Order these cities from west to east
  3,matching,Match each landmark to its city

options[6]{questionIndex,text,isCorrect}:
  0,Ottawa,true
  0,Toronto,false
  0,Vancouver,false
  1,Venice,true
  1,Paris,false
  1,Bangkok,false

orderItems[3]{questionIndex,text,correctOrder}:
  2,San Francisco,0
  2,London,1
  2,Tokyo,2

matchingChoices[3]{questionIndex,text}:
  3,Eiffel Tower
  3,Colosseum
  3,Brandenburg Gate

matchingPairs[3]{questionIndex,leftText,correctChoiceIndex}:
  3,Paris,0
  3,Rome,1
  3,Berlin,2
`;
  }
}
