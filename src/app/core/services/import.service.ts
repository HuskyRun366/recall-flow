import { Injectable } from '@angular/core';
import { Question, MultipleChoiceOption } from '../../models';

export interface ImportedQuestion {
  questionText: string;
  correctAnswer: string;
  distractors?: string[]; // Additional wrong answers
  type: 'flashcard' | 'multiple-choice';
}

export interface ImportResult {
  questions: ImportedQuestion[];
  format: 'csv' | 'anki-txt' | 'quizlet-csv' | 'unknown';
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ImportService {

  /**
   * Main import method - detects format and parses
   */
  async importFromFile(file: File): Promise<ImportResult> {
    const content = await this.readFileContent(file);
    const format = this.detectFormat(content, file.name);

    switch (format) {
      case 'anki-txt':
        return this.parseAnkiTxt(content);
      case 'csv':
      case 'quizlet-csv':
        return this.parseCsv(content);
      default:
        return {
          questions: [],
          format: 'unknown',
          errors: ['Unbekanntes Dateiformat. Unterstützt: CSV, Anki TXT']
        };
    }
  }

  /**
   * Read file content as text
   */
  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  /**
   * Detect file format based on content and filename
   */
  private detectFormat(content: string, filename: string): 'csv' | 'anki-txt' | 'quizlet-csv' | 'unknown' {
    const lines = content.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return 'unknown';

    // Check for Anki TXT format (tab-separated)
    if (lines[0].includes('\t') && !lines[0].includes(',')) {
      return 'anki-txt';
    }

    // Check for CSV
    if (filename.toLowerCase().endsWith('.csv') || lines[0].includes(',')) {
      return 'csv';
    }

    return 'unknown';
  }

  /**
   * Parse Anki TXT format
   * Format: Front\tBack
   * Example: "What is 2+2?\t4"
   */
  private parseAnkiTxt(content: string): ImportResult {
    const lines = content.trim().split('\n').filter(l => l.trim());
    const questions: ImportedQuestion[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      const parts = line.split('\t');

      if (parts.length < 2) {
        errors.push(`Zeile ${index + 1}: Ungültiges Format (erwartet: Frage[TAB]Antwort)`);
        return;
      }

      const questionText = parts[0].trim();
      const correctAnswer = parts[1].trim();

      if (!questionText || !correctAnswer) {
        errors.push(`Zeile ${index + 1}: Leere Frage oder Antwort`);
        return;
      }

      questions.push({
        questionText,
        correctAnswer,
        type: 'flashcard'
      });
    });

    return {
      questions,
      format: 'anki-txt',
      errors
    };
  }

  /**
   * Parse CSV format (supports Quizlet export)
   * Formats supported:
   * - Simple: "Question","Answer"
   * - With distractors: "Question","Correct Answer","Wrong 1","Wrong 2","Wrong 3"
   */
  private parseCsv(content: string): ImportResult {
    const lines = content.trim().split('\n').filter(l => l.trim());
    const questions: ImportedQuestion[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      try {
        const parts = this.parseCsvLine(line);

        if (parts.length < 2) {
          errors.push(`Zeile ${index + 1}: Mindestens 2 Spalten erwartet (Frage, Antwort)`);
          return;
        }

        const questionText = parts[0].trim();
        const correctAnswer = parts[1].trim();
        const distractors = parts.slice(2).map(d => d.trim()).filter(d => d);

        if (!questionText || !correctAnswer) {
          errors.push(`Zeile ${index + 1}: Leere Frage oder Antwort`);
          return;
        }

        questions.push({
          questionText,
          correctAnswer,
          distractors: distractors.length > 0 ? distractors : undefined,
          type: distractors.length >= 2 ? 'multiple-choice' : 'flashcard'
        });
      } catch (err) {
        errors.push(`Zeile ${index + 1}: Parsing-Fehler`);
      }
    });

    return {
      questions,
      format: 'csv',
      errors
    };
  }

  /**
   * Parse a single CSV line (handles quoted values with commas)
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        // Handle escaped quotes ("")
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current);

    return result;
  }

  /**
   * Convert imported questions to Quiz Question format
   */
  convertToQuestions(imported: ImportedQuestion[], quizId: string): Partial<Question>[] {
    return imported.map((q, index) => {
      if (q.type === 'multiple-choice' && q.distractors && q.distractors.length >= 2) {
        // Create multiple choice question
        const options: MultipleChoiceOption[] = [
          { id: this.generateId(), text: q.correctAnswer, isCorrect: true },
          ...q.distractors.slice(0, 3).map(d => ({
            id: this.generateId(),
            text: d,
            isCorrect: false
          }))
        ];

        return {
          quizId,
          orderIndex: index,
          type: 'multiple-choice' as const,
          questionText: q.questionText,
          options: this.shuffleArray(options),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      } else {
        // Create flashcard-style multiple choice with generic wrong answers
        const options: MultipleChoiceOption[] = [
          { id: this.generateId(), text: q.correctAnswer, isCorrect: true },
          { id: this.generateId(), text: 'Falsch A', isCorrect: false },
          { id: this.generateId(), text: 'Falsch B', isCorrect: false },
          { id: this.generateId(), text: 'Falsch C', isCorrect: false }
        ];

        return {
          quizId,
          orderIndex: index,
          type: 'multiple-choice' as const,
          questionText: q.questionText,
          options: this.shuffleArray(options),
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Export quiz to CSV format (for backup/sharing)
   */
  exportToCsv(questions: Question[]): string {
    const lines: string[] = [];

    questions.forEach(q => {
      if (q.type === 'multiple-choice' && q.options) {
        const correct = q.options.find(o => o.isCorrect);
        const wrong = q.options.filter(o => !o.isCorrect);

        if (correct) {
          const row = [
            this.escapeCsv(q.questionText),
            this.escapeCsv(correct.text),
            ...wrong.map(w => this.escapeCsv(w.text))
          ];
          lines.push(row.join(','));
        }
      }
    });

    return lines.join('\n');
  }

  private escapeCsv(value: string): string {
    // Escape quotes and wrap in quotes if contains comma or quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
