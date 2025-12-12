import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../../core/services/toast.service';
import { Quiz, Question, MultipleChoiceQuestion, OrderingQuestion, QuestionType, MultipleChoiceOption, OrderingItem, MatchingQuestion, MatchingChoice, MatchingPair } from '../../../../models';

@Component({
  selector: 'app-graphical-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './graphical-editor.component.html',
  styleUrls: ['./graphical-editor.component.scss']
})
export class GraphicalEditorComponent {
  private toastService = inject(ToastService);
  @Input() quiz!: Partial<Quiz>;
  @Input() questions: Question[] = [];
  @Input() coAuthors: string[] = [];
  @Input() isOwner: boolean = true;
  @Output() quizChange = new EventEmitter<Partial<Quiz>>();
  @Output() questionsChange = new EventEmitter<Question[]>();
  @Output() coAuthorsChange = new EventEmitter<string[]>();

  selectedQuestionIndex = signal<number | null>(null);
  isUploadingImage = signal(false);
  uploadError = signal<string | null>(null);


  scrollTo(anchor: string): void {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    }
  }

  updateQuizMetadata(field: string, value: any): void {
    const updated = { ...this.quiz, [field]: value };
    this.quizChange.emit(updated);
  }

  onCoAuthorInput(raw: string): void {
    const emails = raw
      .split(/[\n,;]/)
      .map(e => e.trim().toLowerCase())
      .filter(e => !!e);
    const unique = Array.from(new Set(emails));
    this.coAuthorsChange.emit(unique);
  }

  addQuestion(type: QuestionType): void {
    const newQuestion: Question = type === 'multiple-choice'
      ? {
          id: crypto.randomUUID(),
          quizId: this.quiz.id || '',
          orderIndex: this.questions.length,
          type: 'multiple-choice',
          questionText: 'New Question',
          options: [
            { id: crypto.randomUUID(), text: 'Option 1', isCorrect: true },
            { id: crypto.randomUUID(), text: 'Option 2', isCorrect: false }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        } as Question
      : type === 'matching'
        ? {
            id: crypto.randomUUID(),
            quizId: this.quiz.id || '',
            orderIndex: this.questions.length,
            type: 'matching',
            questionText: 'Neue Zuordnungsfrage',
            matchingChoices: [],
            matchingPairs: [],
            createdAt: new Date(),
            updatedAt: new Date()
          } as Question
      : {
          id: crypto.randomUUID(),
          quizId: this.quiz.id || '',
          orderIndex: this.questions.length,
          type: 'ordering',
          questionText: 'New Ordering Question',
          orderItems: [
            { id: crypto.randomUUID(), text: 'Item 1', correctOrder: 0 },
            { id: crypto.randomUUID(), text: 'Item 2', correctOrder: 1 }
          ],
          createdAt: new Date(),
          updatedAt: new Date()
        } as Question;

    if (type === 'matching') {
      const matchingQuestion = newQuestion as MatchingQuestion;
      const defaultChoices: MatchingChoice[] = [
        { id: crypto.randomUUID(), text: 'Option A' },
        { id: crypto.randomUUID(), text: 'Option B' },
        { id: crypto.randomUUID(), text: 'Option C' }
      ];
      const firstChoiceId = defaultChoices[0].id;
      const defaultPairs: MatchingPair[] = [
        { id: crypto.randomUUID(), leftText: 'Linker Text 1', correctChoiceId: firstChoiceId },
        { id: crypto.randomUUID(), leftText: 'Linker Text 2', correctChoiceId: firstChoiceId },
        { id: crypto.randomUUID(), leftText: 'Linker Text 3', correctChoiceId: firstChoiceId }
      ];
      matchingQuestion.matchingChoices = defaultChoices;
      matchingQuestion.matchingPairs = defaultPairs;
    }

    this.questionsChange.emit([...this.questions, newQuestion]);
    this.selectedQuestionIndex.set(this.questions.length);
  }

  deleteQuestion(index: number): void {
    if (!confirm('Are you sure you want to delete this question?')) return;

    const updatedQuestions = this.questions.filter((_, i) => i !== index);
    this.questionsChange.emit(updatedQuestions);

    if (this.selectedQuestionIndex() === index) {
      this.selectedQuestionIndex.set(null);
    }
  }

  moveQuestion(index: number, direction: 'up' | 'down'): void {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.questions.length) return;

    const questions = [...this.questions];
    [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];

    // Update orderIndex for all questions
    questions.forEach((q, i) => q.orderIndex = i);

    this.questionsChange.emit(questions);

    if (this.selectedQuestionIndex() === index) {
      this.selectedQuestionIndex.set(newIndex);
    }
  }

  selectQuestion(index: number): void {
    this.selectedQuestionIndex.set(index);
  }

  // TrackBy helpers to prevent DOM re-creation (keeps focus while typing)
  trackByQuestion = (_: number, question: Question) => question.id;
  trackByOption = (_: number, option: MultipleChoiceOption) => option.id;
  trackByOrderItem = (_: number, item: OrderingItem) => item.id;
  trackByMatchingChoice = (_: number, choice: MatchingChoice) => choice.id;
  trackByMatchingPair = (_: number, pair: MatchingPair) => pair.id;

  updateQuestion(index: number, field: string, value: any): void {
    const questions = [...this.questions];
    questions[index] = { ...questions[index], [field]: value, updatedAt: new Date() };
    this.questionsChange.emit(questions);
  }

  // Multiple Choice specific methods
  addOption(questionIndex: number): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'multiple-choice') return;

    const newOption: MultipleChoiceOption = {
      id: crypto.randomUUID(),
      text: 'New Option',
      isCorrect: false
    };

    const updated = {
      ...question,
      options: [...(question.options || []), newOption],
      updatedAt: new Date()
    };

    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  deleteOption(questionIndex: number, optionIndex: number): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'multiple-choice') return;
    if ((question.options?.length || 0) <= 2) {
      this.toastService.warning('Eine Frage benötigt mindestens 2 Optionen');
      return;
    }

    const updated = {
      ...question,
      options: question.options!.filter((_: MultipleChoiceOption, i: number) => i !== optionIndex),
      updatedAt: new Date()
    };

    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  updateOption(questionIndex: number, optionIndex: number, field: string, value: any): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'multiple-choice') return;

    const options = [...(question.options || [])];
    options[optionIndex] = { ...options[optionIndex], [field]: value };

    const updated = { ...question, options, updatedAt: new Date() };
    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  // Ordering specific methods
  addOrderItem(questionIndex: number): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'ordering') return;

    const newItem: OrderingItem = {
      id: crypto.randomUUID(),
      text: 'New Item',
      correctOrder: question.orderItems?.length || 0
    };

    const updated = {
      ...question,
      orderItems: [...(question.orderItems || []), newItem],
      updatedAt: new Date()
    };

    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  deleteOrderItem(questionIndex: number, itemIndex: number): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'ordering') return;
    if ((question.orderItems?.length || 0) <= 2) {
      this.toastService.warning('Eine Frage benötigt mindestens 2 Items');
      return;
    }

    const orderItems = (question.orderItems || [])
      .filter((_: OrderingItem, i: number) => i !== itemIndex)
      .map((item: OrderingItem, i: number) => ({ ...item, correctOrder: i }));

    const updated = { ...question, orderItems, updatedAt: new Date() };
    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  updateOrderItem(questionIndex: number, itemIndex: number, field: string, value: any): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'ordering') return;

    const orderItems = [...(question.orderItems || [])];
    orderItems[itemIndex] = { ...orderItems[itemIndex], [field]: value };

    const updated = { ...question, orderItems, updatedAt: new Date() };
    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  moveOrderItem(questionIndex: number, itemIndex: number, direction: 'up' | 'down'): void {
    const question = this.questions[questionIndex];
    if (question.type !== 'ordering') return;

    const newIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (newIndex < 0 || newIndex >= (question.orderItems?.length || 0)) return;

    const orderItems = [...(question.orderItems || [])];
    [orderItems[itemIndex], orderItems[newIndex]] = [orderItems[newIndex], orderItems[itemIndex]];

    // Update correctOrder
    orderItems.forEach((item: OrderingItem, i: number) => {
      item.correctOrder = i;
    });

    const updated = { ...question, orderItems, updatedAt: new Date() };
    const questions = [...this.questions];
    questions[questionIndex] = updated;
    this.questionsChange.emit(questions);
  }

  // Matching specific methods
  addMatchingChoice(questionIndex: number): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;

    const newChoice: MatchingChoice = {
      id: crypto.randomUUID(),
      text: 'Neue Auswahl'
    };

    const updated = {
      ...question,
      matchingChoices: [...(question.matchingChoices || []), newChoice],
      updatedAt: new Date()
    } as MatchingQuestion;

    this.replaceQuestion(questionIndex, updated);
  }

  deleteMatchingChoice(questionIndex: number, choiceId: string): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;
    if ((question.matchingChoices?.length || 0) <= 2) {
      this.toastService.warning('Eine Matching-Frage benötigt mindestens 2 Auswahloptionen');
      return;
    }

    const choices = (question.matchingChoices || []).filter(c => c.id !== choiceId);
    const pairs = (question.matchingPairs || []).map(pair =>
      choices.some(c => c.id === pair.correctChoiceId)
        ? pair
        : { ...pair, correctChoiceId: choices[0]?.id || '' }
    );

    const updated = { ...question, matchingChoices: choices, matchingPairs: pairs, updatedAt: new Date() } as MatchingQuestion;
    this.replaceQuestion(questionIndex, updated);
  }

  updateMatchingChoice(questionIndex: number, choiceId: string, value: string): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;

    const choices = (question.matchingChoices || []).map(choice =>
      choice.id === choiceId ? { ...choice, text: value } : choice
    );

    const updated = { ...question, matchingChoices: choices, updatedAt: new Date() } as MatchingQuestion;
    this.replaceQuestion(questionIndex, updated);
  }

  addMatchingPair(questionIndex: number): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;

    const defaultChoiceId = question.matchingChoices?.[0]?.id || '';
    const newPair: MatchingPair = {
      id: crypto.randomUUID(),
      leftText: 'Neuer linker Text',
      correctChoiceId: defaultChoiceId
    };

    const updated = {
      ...question,
      matchingPairs: [...(question.matchingPairs || []), newPair],
      updatedAt: new Date()
    } as MatchingQuestion;

    this.replaceQuestion(questionIndex, updated);
  }

  deleteMatchingPair(questionIndex: number, pairId: string): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;
    if ((question.matchingPairs?.length || 0) <= 2) {
      this.toastService.warning('Eine Matching-Frage benötigt mindestens 2 Paare');
      return;
    }

    const updatedPairs = (question.matchingPairs || []).filter(p => p.id !== pairId);
    const updated = { ...question, matchingPairs: updatedPairs, updatedAt: new Date() } as MatchingQuestion;
    this.replaceQuestion(questionIndex, updated);
  }

  updateMatchingPairText(questionIndex: number, pairId: string, value: string): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;

    const pairs = (question.matchingPairs || []).map(pair =>
      pair.id === pairId ? { ...pair, leftText: value } : pair
    );

    const updated = { ...question, matchingPairs: pairs, updatedAt: new Date() } as MatchingQuestion;
    this.replaceQuestion(questionIndex, updated);
  }

  updateMatchingPairChoice(questionIndex: number, pairId: string, choiceId: string): void {
    const question = this.questions[questionIndex] as MatchingQuestion;
    if (question.type !== 'matching') return;

    const pairs = (question.matchingPairs || []).map(pair =>
      pair.id === pairId ? { ...pair, correctChoiceId: choiceId } : pair
    );

    const updated = { ...question, matchingPairs: pairs, updatedAt: new Date() } as MatchingQuestion;
    this.replaceQuestion(questionIndex, updated);
  }

  private replaceQuestion(index: number, updated: Question): void {
    const questions = [...this.questions];
    questions[index] = updated;
    this.questionsChange.emit(questions);
  }

}
