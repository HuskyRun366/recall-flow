import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MarketplaceItem, Quiz, FlashcardDeck, LearningMaterial } from '../../../models';
import { StarRatingComponent } from '../star-rating/star-rating.component';

@Component({
  selector: 'app-marketplace-card',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StarRatingComponent],
  templateUrl: './marketplace-card.component.html',
  styleUrls: ['./marketplace-card.component.scss']
})
export class MarketplaceCardComponent {
  item = input.required<MarketplaceItem>();
  showForkButton = input<boolean>(true);

  fork = output<MarketplaceItem>();

  contentLink = computed(() => {
    const item = this.item();
    switch (item.type) {
      case 'quiz':
        return ['/quiz', item.content.id];
      case 'deck':
        return ['/lernen/deck', item.content.id];
      case 'material':
        return ['/lernen/material', item.content.id];
    }
  });

  typeIcon = computed(() => {
    switch (this.item().type) {
      case 'quiz':
        return 'quiz';
      case 'deck':
        return 'flashcard';
      case 'material':
        return 'material';
    }
  });

  typeLabel = computed(() => {
    switch (this.item().type) {
      case 'quiz':
        return 'discover.contentTypes.quiz';
      case 'deck':
        return 'discover.contentTypes.deck';
      case 'material':
        return 'discover.contentTypes.material';
    }
  });

  itemCount = computed(() => {
    const item = this.item();
    switch (item.type) {
      case 'quiz':
        return (item.content as Quiz).questionCount;
      case 'deck':
        return (item.content as FlashcardDeck).cardCount;
      case 'material':
        return Math.round((item.content as LearningMaterial).contentSize / 1024); // KB
    }
  });

  itemCountLabel = computed(() => {
    switch (this.item().type) {
      case 'quiz':
        return 'discover.questions';
      case 'deck':
        return 'discover.cards';
      case 'material':
        return 'discover.kb';
    }
  });

  popularityCount = computed(() => {
    const item = this.item();
    switch (item.type) {
      case 'quiz':
        return (item.content as Quiz).metadata.totalParticipants;
      case 'deck':
        return (item.content as FlashcardDeck).metadata.totalStudents;
      case 'material':
        return (item.content as LearningMaterial).metadata.totalStudents;
    }
  });

  categoryLabel = computed(() => {
    const category = this.item().content.category;
    return category ? `discover.categories.${category}` : null;
  });

  difficultyLabel = computed(() => {
    const difficulty = this.item().content.difficulty;
    return difficulty ? `discover.difficulties.${difficulty}` : null;
  });

  onFork(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.fork.emit(this.item());
  }
}
