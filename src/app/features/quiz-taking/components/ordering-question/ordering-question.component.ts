import { Component, Input, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { OrderingQuestion, OrderingItem } from '../../../../models';
import { HapticService } from '../../../../core/services/haptic.service';

@Component({
  selector: 'app-ordering-question',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './ordering-question.component.html',
  styleUrls: ['./ordering-question.component.scss']
})
export class OrderingQuestionComponent {
  private haptic = inject(HapticService);

  @Input() set question(value: OrderingQuestion) {
    this._question = value;
    this.initializeItems();
  }
  get question(): OrderingQuestion {
    return this._question;
  }

  @Input() disabled = false;
  @Input() showResult = false;
  @Output() answerSubmit = new EventEmitter<boolean>();

  private _question!: OrderingQuestion;
  currentOrder = signal<OrderingItem[]>([]);
  submitted = signal(false);
  resultCorrect = signal(false);
  isCorrect = computed(() => {
    if (!this.submitted()) return false;
    return this.resultCorrect();
  });

  private initializeItems(): void {
    // Reset state when new question is loaded
    this.submitted.set(false);
    this.resultCorrect.set(false);

    // Shuffle items for the user to order
    const items = [...this._question.orderItems];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    this.currentOrder.set(items);
  }

  drop(event: CdkDragDrop<OrderingItem[]>): void {
    if (this.disabled || this.submitted()) return;

    const items = [...this.currentOrder()];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.currentOrder.set(items);
  }

  submitAnswer(): void {
    if (this.submitted()) return;

    this.submitted.set(true);
    const correct = this.checkOrder();
    this.resultCorrect.set(correct);

    // Haptic feedback for answer result
    if (correct) {
      this.haptic.correctAnswer();
    } else {
      this.haptic.incorrectAnswer();
    }

    this.answerSubmit.emit(correct);
  }

  private checkOrder(): boolean {
    const current = this.currentOrder();
    return current.every((item, index) => item.correctOrder === index);
  }

  reset(): void {
    this.submitted.set(false);
    this.resultCorrect.set(false);
    this.initializeItems();
  }

  correctOrder(): OrderingItem[] {
    return [...this.question.orderItems].sort((a, b) => a.correctOrder - b.correctOrder);
  }

  getItemClass(item: OrderingItem, index: number): string {
    if (!this.submitted() && !this.showResult) return '';
    return item.correctOrder === index ? 'correct' : 'incorrect';
  }
}
