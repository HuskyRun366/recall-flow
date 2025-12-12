import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MultipleChoiceQuestion } from '../../../../models';
import { HapticService } from '../../../../core/services/haptic.service';

@Component({
  selector: 'app-multiple-choice',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './multiple-choice.component.html',
  styleUrls: ['./multiple-choice.component.scss']
})
export class MultipleChoiceComponent {
  private haptic = inject(HapticService);
  private _question!: MultipleChoiceQuestion;

  @Input() set question(value: MultipleChoiceQuestion) {
    this._question = value;
    this.reset();
  }
  get question(): MultipleChoiceQuestion {
    return this._question;
  }
  @Input() showResult = false;
  @Input() disabled = false;
  @Output() answerSubmit = new EventEmitter<boolean>();

  // Expose String for template usage
  String = String;

  selectedOptionIds = signal<Set<string>>(new Set());
  submitted = signal(false);
  resultCorrect = signal(false);

  toggleOption(optionId: string): void {
    if (this.disabled || this.submitted()) return;

    // No haptic feedback on selection (too much)
    const next = new Set(this.selectedOptionIds());
    next.has(optionId) ? next.delete(optionId) : next.add(optionId);
    this.selectedOptionIds.set(next);
  }

  submitAnswer(): void {
    const selected = Array.from(this.selectedOptionIds());
    if (selected.length === 0 || this.submitted()) return;

    this.submitted.set(true);

    const correctIds = this.question.options
      .filter(opt => opt.isCorrect)
      .map(opt => opt.id);

    const isCorrect =
      selected.length === correctIds.length &&
      correctIds.every(id => this.selectedOptionIds().has(id));

    this.resultCorrect.set(isCorrect);

    // Haptic feedback for answer result
    if (isCorrect) {
      this.haptic.correctAnswer();
    } else {
      this.haptic.incorrectAnswer();
    }

    this.answerSubmit.emit(isCorrect);
  }

  reset(): void {
    this.selectedOptionIds.set(new Set());
    this.submitted.set(false);
    this.resultCorrect.set(false);
  }

  isSelected(optionId: string): boolean {
    return this.selectedOptionIds().has(optionId);
  }

  selectedCount(): number {
    return this.selectedOptionIds().size;
  }
}
