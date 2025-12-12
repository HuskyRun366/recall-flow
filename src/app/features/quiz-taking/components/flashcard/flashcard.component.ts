import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Question } from '../../../../models';

@Component({
  selector: 'app-flashcard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './flashcard.component.html',
  styleUrls: ['./flashcard.component.scss']
})
export class FlashcardComponent {
  @Input() question!: Question;
  @Input() disabled: boolean = false;
  @Output() answerSubmit = new EventEmitter<boolean>(); // true = knew it, false = didn't know

  isFlipped = signal(false);

  flip(): void {
    if (!this.disabled) {
      this.isFlipped.update(flipped => !flipped);
    }
  }

  markAsKnown(): void {
    this.answerSubmit.emit(true);
    this.isFlipped.set(false);
  }

  markAsUnknown(): void {
    this.answerSubmit.emit(false);
    this.isFlipped.set(false);
  }

  getCorrectAnswer(): string {
    switch (this.question.type) {
      case 'multiple-choice':
        const correctOption = this.question.options?.find(o => o.isCorrect);
        return correctOption?.text || 'No correct answer found';

      case 'ordering':
        if (!this.question.orderItems) return 'No order items';
        return this.question.orderItems
          .sort((a, b) => a.correctOrder - b.correctOrder)
          .map((item, idx) => `${idx + 1}. ${item.text}`)
          .join('\n');

      case 'matching':
        if (!this.question.matchingPairs || !this.question.matchingChoices) {
          return 'No matching pairs';
        }
        // Create a map of choice IDs to their text
        const choiceMap = new Map(
          this.question.matchingChoices.map(choice => [choice.id, choice.text])
        );
        return this.question.matchingPairs
          .map(pair => {
            const rightText = choiceMap.get(pair.correctChoiceId) || 'Unknown';
            return `${pair.leftText} → ${rightText}`;
          })
          .join('\n');

      default:
        return 'Answer not available';
    }
  }
}
