import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MarketplaceItem,
  TopChartType,
  ContentCategory,
  DifficultyLevel,
  Quiz,
  FlashcardDeck,
  LearningMaterial
} from '../../models';
import { ContentType } from '../../models/review.model';
import { MarketplaceService, MarketplaceSearchParams } from '../../core/services/marketplace.service';
import { ForkService } from '../../core/services/fork.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ColorThemeService } from '../../core/services/color-theme.service';
import { SearchBarComponent } from '../../shared/components/search-bar/search-bar.component';
import { MarketplaceCardComponent } from '../../shared/components/marketplace-card/marketplace-card.component';
import { FilterPanelComponent } from '../../shared/components/filter-panel/filter-panel.component';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader/skeleton-loader.component';

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
    SkeletonLoaderComponent
  ],
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.scss']
})
export class DiscoverComponent implements OnInit {
  private marketplaceService = inject(MarketplaceService);
  private forkService = inject(ForkService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private colorThemeService = inject(ColorThemeService);
  private router = inject(Router);
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
  isForkingId = signal<string | null>(null);

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

  ngOnInit(): void {
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

  async onFork(item: MarketplaceItem): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) {
      this.toastService.error('You must be logged in to fork content');
      return;
    }

    this.isForkingId.set(item.content.id);

    try {
      if (item.type === 'theme') {
        const originId = (item.content as any).originId ?? item.content.id;
        const installedId = this.colorThemeService.installCommunityTheme(originId);
        if (installedId) {
          this.toastService.success('Theme installed');
        } else {
          this.toastService.info('Theme already installed');
        }
        this.router.navigate(['/settings']);
        return;
      }

      const ownerName = await this.forkService.getOwnerDisplayName(item.content.ownerId);
      let newId: string;

      switch (item.type) {
        case 'quiz':
          newId = await this.forkService.forkQuiz(
            item.content as Quiz,
            user.uid,
            user.email || '',
            ownerName
          );
          this.toastService.success('discover.fork.success');
          this.router.navigate(['/quiz/editor', newId]);
          break;

        case 'deck':
          newId = await this.forkService.forkDeck(
            item.content as FlashcardDeck,
            user.uid,
            user.email || '',
            ownerName
          );
          this.toastService.success('discover.fork.success');
          this.router.navigate(['/lernen/deck-editor', newId]);
          break;

        case 'material':
          newId = await this.forkService.forkMaterial(
            item.content as LearningMaterial,
            user.uid,
            user.email || '',
            ownerName
          );
          this.toastService.success('discover.fork.success');
          this.router.navigate(['/lernen/material-editor', newId]);
          break;
      }
    } catch (error) {
      console.error('Fork failed:', error);
      this.toastService.error('discover.fork.error');
    } finally {
      this.isForkingId.set(null);
    }
  }

  private loadFeatured(): void {
    this.isLoadingFeatured.set(true);

    this.marketplaceService.getFeatured()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.featuredItems.set(items);
          this.isLoadingFeatured.set(false);
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
        },
        error: (err) => {
          console.error('Search failed:', err);
          this.isLoadingSearch.set(false);
        }
      });
  }
}
