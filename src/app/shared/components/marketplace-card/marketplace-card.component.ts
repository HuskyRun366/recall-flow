import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MarketplaceItem, MarketplaceTheme, Quiz, FlashcardDeck, LearningMaterial, ForkedFromInfo } from '../../../models';
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
      case 'theme':
        return ['/settings'];
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
      case 'theme':
        return 'theme';
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
      case 'theme':
        return 'discover.contentTypes.theme';
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
      case 'theme': {
        const theme = item.content as MarketplaceTheme;
        return Object.keys(theme.palette || {}).length;
      }
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
      case 'theme':
        return 'discover.colors';
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
      case 'theme':
        return (item.content as MarketplaceTheme).metadata.totalInstalls;
    }
  });

  popularityLabel = computed(() => {
    return this.item().type === 'theme' ? 'discover.installs' : 'discover.users';
  });

  categoryLabel = computed(() => {
    const item = this.item();
    if (item.type === 'theme') return null;
    const category = (item.content as Quiz | FlashcardDeck | LearningMaterial).category;
    return category ? `discover.categories.${category}` : null;
  });

  difficultyLabel = computed(() => {
    const item = this.item();
    if (item.type === 'theme') return null;
    const difficulty = (item.content as Quiz | FlashcardDeck | LearningMaterial).difficulty;
    return difficulty ? `discover.difficulties.${difficulty}` : null;
  });

  difficultyClass = computed(() => {
    const item = this.item();
    if (item.type === 'theme') return '';
    const difficulty = (item.content as Quiz | FlashcardDeck | LearningMaterial).difficulty;
    return difficulty ? `difficulty-${difficulty}` : '';
  });

  languageCode = computed(() => {
    const item = this.item();
    if (item.type === 'theme') return null;
    return (item.content as Quiz | FlashcardDeck | LearningMaterial).language ?? null;
  });

  forkedFrom = computed<ForkedFromInfo | null>(() => {
    const item = this.item();
    if (item.type === 'theme') return null;
    return (item.content as Quiz | FlashcardDeck | LearningMaterial).forkedFrom ?? null;
  });

  themePreviewGradient = computed(() => {
    if (this.item().type !== 'theme') return null;
    const theme = this.item().content as MarketplaceTheme;
    return `linear-gradient(135deg, ${theme.palette.primary}, ${theme.palette.accent})`;
  });

  actionLabelKey = computed(() => {
    return this.item().type === 'theme'
      ? 'settings.page.theme.marketplace.install'
      : 'discover.fork.button';
  });

  onFork(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.fork.emit(this.item());
  }
}
