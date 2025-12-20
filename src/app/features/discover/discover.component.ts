import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
  MarketplaceItem,
  TopChartType,
  ContentCategory,
  DifficultyLevel,
  Quiz,
  FlashcardDeck,
  LearningMaterial,
  MarketplaceTheme
} from '../../models';
import { ContentType } from '../../models/review.model';
import { MarketplaceService, MarketplaceSearchParams } from '../../core/services/marketplace.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ColorThemeService } from '../../core/services/color-theme.service';
import { ParticipantService } from '../../core/services/participant.service';
import { DeckParticipantService } from '../../core/services/deck-participant.service';
import { MaterialParticipantService } from '../../core/services/material-participant.service';
import { ReviewService } from '../../core/services/review.service';
import { Review } from '../../models';
import { SearchBarComponent } from '../../shared/components/search-bar/search-bar.component';
import { MarketplaceCardComponent } from '../../shared/components/marketplace-card/marketplace-card.component';
import { FilterPanelComponent } from '../../shared/components/filter-panel/filter-panel.component';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';
import { ReviewDialogComponent } from '../../shared/components/review-dialog/review-dialog.component';

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    SearchBarComponent,
    MarketplaceCardComponent,
    FilterPanelComponent,
    SkeletonLoaderComponent,
    ReviewDialogComponent
  ],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss']
})
export class DiscoverComponent implements OnInit {
  private marketplaceService = inject(MarketplaceService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private colorThemeService = inject(ColorThemeService);
  private participantService = inject(ParticipantService);
  private deckParticipantService = inject(DeckParticipantService);
  private materialParticipantService = inject(MaterialParticipantService);
  private reviewService = inject(ReviewService);
  private translateService = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  // Filter state
  searchTerm = signal('');
  contentType = signal<ContentType | 'all'>('all');
  category = signal<ContentCategory | null>(null);
  difficulty = signal<DifficultyLevel | null>(null);
  language = signal<string | null>(null);

  // Top charts state
  activeChart = signal<TopChartType>('popular');

  // Data
  featuredItems = signal<MarketplaceItem[]>([]);
  searchResults = signal<MarketplaceItem[]>([]);
  topChartItems = signal<MarketplaceItem[]>([]);

  // Loading states
  isLoadingFeatured = signal(true);
  isLoadingSearch = signal(true);
  isLoadingChart = signal(true);

  // Enrollment state
  private enrollmentSets = signal<{
    quizIds: Set<string>;
    deckIds: Set<string>;
    materialIds: Set<string>;
  } | null>(null);
  private enrollmentLoadPromise: Promise<void> | null = null;
  private enrollmentUserId: string | null = null;

  // Review dialog state
  showReviewDialog = signal(false);
  reviewContentId = signal<string | null>(null);
  reviewContentType = signal<ContentType | null>(null);
  reviewContentTitle = signal<string | null>(null);
  existingReview = signal<Review | null>(null);

  // Computed
  hasSearchFilters = computed(() => {
    return this.searchTerm() !== '' ||
           this.contentType() !== 'all' ||
           this.category() !== null ||
           this.difficulty() !== null ||
           this.language() !== null;
  });

  filteredResults = computed(() => {
    const type = this.contentType();
    const results = this.searchResults();
    if (type === 'all') return results;
    return results.filter(item => item.type === type);
  });

  resultCounts = computed(() => ({
    all: this.searchResults().length,
    quiz: this.searchResults().filter(i => i.type === 'quiz').length,
    deck: this.searchResults().filter(i => i.type === 'deck').length,
    material: this.searchResults().filter(i => i.type === 'material').length
  }));

  currentUserId = computed(() => this.authService.currentUser()?.uid);

  ngOnInit(): void {
    void this.ensureEnrollmentSets();
    this.loadFeatured();
    this.loadTopChart('popular');
    this.performSearch();
  }

  onSearchChange(term: string): void {
    this.searchTerm.set(term);
    this.performSearch();
  }

  onFilterChange(): void {
    this.performSearch();
  }

  selectChart(chart: TopChartType): void {
    this.activeChart.set(chart);
    this.loadTopChart(chart);
  }

  private loadFeatured(): void {
    this.isLoadingFeatured.set(true);

    this.marketplaceService.getFeatured()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.featuredItems.set(items);
          this.isLoadingFeatured.set(false);
          void this.ensureEnrollmentSets();
        },
        error: (err) => {
          console.error('Failed to load featured:', err);
          this.isLoadingFeatured.set(false);
        }
      });
  }

  private loadTopChart(chart: TopChartType): void {
    this.isLoadingChart.set(true);

    let observable;
    switch (chart) {
      case 'trending':
        observable = this.marketplaceService.getTrending(undefined, 8);
        break;
      case 'popular':
        observable = this.marketplaceService.getMostPopular(undefined, 8);
        break;
      case 'recent':
        observable = this.marketplaceService.getRecentlyAdded(undefined, 8);
        break;
    }

    observable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.topChartItems.set(items);
          this.isLoadingChart.set(false);
          void this.ensureEnrollmentSets();
        },
        error: (err) => {
          console.error('Failed to load chart:', err);
          this.isLoadingChart.set(false);
        }
      });
  }

  private performSearch(): void {
    this.isLoadingSearch.set(true);

    const params: MarketplaceSearchParams = {
      limitCount: 50,
      sortBy: 'rating'
    };

    if (this.searchTerm()) {
      params.query = this.searchTerm();
    }

    if (this.contentType() !== 'all') {
      params.contentTypes = [this.contentType() as ContentType];
    }

    if (this.category()) {
      params.category = this.category()!;
    }

    if (this.difficulty()) {
      params.difficulty = this.difficulty()!;
    }

    if (this.language()) {
      params.language = this.language()!;
    }

    this.marketplaceService.searchMarketplace(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.searchResults.set(items);
          this.isLoadingSearch.set(false);
          void this.ensureEnrollmentSets();
        },
        error: (err) => {
          console.error('Search failed:', err);
          this.isLoadingSearch.set(false);
        }
      });
  }

  async onAdd(item: MarketplaceItem): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      this.toastService.error('Please log in to add content');
      return;
    }

    try {
      if (item.type === 'theme') {
        // Install theme
        const theme = item.content as MarketplaceTheme;
        this.colorThemeService.installMarketplaceTheme(theme);
        this.toastService.success(
          this.translateService.instant('settings.page.theme.marketplace.installed', { name: theme.title })
        );
      } else {
        // Enroll in quiz/deck/material
        const contentId = item.content.id;
        const userId = user.uid;
        const email = user.email || '';

        switch (item.type) {
          case 'quiz':
            await this.participantService.addParticipant(
              contentId,
              userId,
              email,
              'participant',
              undefined,
              'accepted'
            );
            this.toastService.success(
              this.translateService.instant('discover.added.quiz', { title: item.content.title })
            );
            this.markEnrolled(item);
            break;

          case 'deck':
            await this.deckParticipantService.addParticipant(
              contentId,
              userId,
              email,
              'student',
              undefined,
              'accepted'
            );
            this.toastService.success(
              this.translateService.instant('discover.added.deck', { title: item.content.title })
            );
            this.markEnrolled(item);
            break;

          case 'material':
            await this.materialParticipantService.addParticipant(
              contentId,
              userId,
              email,
              'student',
              undefined,
              'accepted'
            );
            this.toastService.success(
              this.translateService.instant('discover.added.material', { title: item.content.title })
            );
            this.markEnrolled(item);
            break;
        }
      }
    } catch (error) {
      console.error('Failed to add content:', error);
      this.toastService.error(
        this.translateService.instant('discover.addFailed')
      );
    }
  }

  private async ensureEnrollmentSets(): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      this.enrollmentUserId = null;
      this.enrollmentLoadPromise = null;
      this.enrollmentSets.set(null);
      return;
    }

    if (this.enrollmentUserId === userId && this.enrollmentLoadPromise) {
      await this.enrollmentLoadPromise;
      return;
    }

    this.enrollmentUserId = userId;
    this.enrollmentLoadPromise = (async () => {
      const [userQuizzes, userDecks, userMaterials] = await Promise.all([
        firstValueFrom(this.participantService.getUserQuizzes(userId)),
        firstValueFrom(this.deckParticipantService.getUserDecks(userId)),
        firstValueFrom(this.materialParticipantService.getUserMaterials(userId))
      ]);

      this.enrollmentSets.set({
        quizIds: new Set(userQuizzes.map(quiz => quiz.quizId)),
        deckIds: new Set(userDecks.map(deck => deck.deckId)),
        materialIds: new Set(userMaterials.map(material => material.materialId))
      });
    })().catch(err => {
      console.error('Failed to load enrollments:', err);
      this.enrollmentSets.set(null);
    });

    await this.enrollmentLoadPromise;
  }

  private markEnrolled(item: MarketplaceItem): void {
    const sets = this.enrollmentSets();
    if (!sets) return;

    const next = {
      quizIds: new Set(sets.quizIds),
      deckIds: new Set(sets.deckIds),
      materialIds: new Set(sets.materialIds)
    };

    switch (item.type) {
      case 'quiz':
        next.quizIds.add(item.content.id);
        break;
      case 'deck':
        next.deckIds.add(item.content.id);
        break;
      case 'material':
        next.materialIds.add(item.content.id);
        break;
      default:
        return;
    }

    this.enrollmentSets.set(next);
  }

  isItemEnrolled(item: MarketplaceItem): boolean {
    if (item.type === 'theme') {
      return this.colorThemeService.isThemeInstalled(item.content.id);
    }

    const sets = this.enrollmentSets();
    if (!sets) return false;

    switch (item.type) {
      case 'quiz':
        return sets.quizIds.has(item.content.id);
      case 'deck':
        return sets.deckIds.has(item.content.id);
      case 'material':
        return sets.materialIds.has(item.content.id);
      default:
        return false;
    }
  }

  async onRateItem(item: MarketplaceItem): Promise<void> {
    const userId = this.authService.currentUser()?.uid;
    if (!userId) {
      this.toastService.error('Bitte melde dich an');
      return;
    }

    // Load existing review
    const existingReview = await this.reviewService.getUserReviewAsync(item.content.id, item.type, userId);

    this.reviewContentId.set(item.content.id);
    this.reviewContentType.set(item.type);
    this.reviewContentTitle.set(item.content.title);
    this.existingReview.set(existingReview || null);
    this.showReviewDialog.set(true);
  }

  closeReviewDialog(): void {
    this.showReviewDialog.set(false);
    this.reviewContentId.set(null);
    this.reviewContentType.set(null);
    this.reviewContentTitle.set(null);
    this.existingReview.set(null);
  }

  onReviewSubmitted(): void {
    // Reload items to get updated ratings
    this.loadFeatured();
    this.loadTopChart(this.activeChart());
    this.performSearch();
    this.closeReviewDialog();
    this.toastService.success('Bewertung gespeichert');
  }
}
