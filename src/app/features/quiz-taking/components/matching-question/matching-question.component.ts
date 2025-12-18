import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatchingQuestion } from '../../../../models';
import { HapticService } from '../../../../core/services/haptic.service';

@Component({
  selector: 'app-matching-question',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './matching-question.component.html',
  styleUrls: ['./matching-question.component.scss']
})
export class MatchingQuestionComponent {
  private haptic = inject(HapticService);

  private _question!: MatchingQuestion;

  @Input() set question(value: MatchingQuestion) {
    this._question = value;
    this.reset();
  }
  get question(): MatchingQuestion {
    return this._question;
  }

  @Input() showResult = false;
  @Input() disabled = false;
  @Output() answerSubmit = new EventEmitter<boolean>();

  selections = signal<Map<string, string>>(new Map());
  submitted = signal(false);
  resultCorrect = signal(false);

  readonly String = String; // expose for template badge letters

  isSelectionMissing(): boolean {
    const pairs = this.question.matchingPairs || [];
    return pairs.some(pair => !this.selections().get(pair.id));
  }

  selectChoice(pairId: string, choiceId: string): void {
    if (this.disabled || this.submitted()) return;

    const next = new Map(this.selections());
    next.set(pairId, choiceId);
    this.selections.set(next);
  }

  choiceText(choiceId: string): string {
    const choice = (this.question.matchingChoices || []).find(c => c.id === choiceId);
    return choice?.text || '';
  }

  submitAnswer(): void {
    if (this.submitted()) return;

    const pairs = this.question.matchingPairs || [];
    const allSelected = pairs.every(p => this.selections().has(p.id));
    if (!allSelected) return;

    this.submitted.set(true);

    const isCorrect = pairs.every(pair => {
      const selected = this.selections().get(pair.id);
      return selected === pair.correctChoiceId;
    });

    this.resultCorrect.set(isCorrect);

    if (isCorrect) {
      this.haptic.correctAnswer();
    } else {
      this.haptic.incorrectAnswer();
    }

    this.answerSubmit.emit(isCorrect);
  }

  reset(): void {
    this.selections.set(new Map());
    this.submitted.set(false);
    this.resultCorrect.set(false);
  }

  isSelected(pairId: string, choiceId: string): boolean {
    return this.selections().get(pairId) === choiceId;
  }

  // Helper to check if a specific pair is currently korrekt zugeordnet
  isPairCorrect(pairId: string): boolean {
    const selected = this.selections().get(pairId);
    const pair = this.question.matchingPairs?.find(p => p.id === pairId);
    if (!pair) return false;
    return selected === pair.correctChoiceId;
  }
}
