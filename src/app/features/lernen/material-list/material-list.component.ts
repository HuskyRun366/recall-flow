import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { LearningMaterialService } from '../../../core/services/learning-material.service';
import { MaterialParticipantService } from '../../../core/services/material-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { StatCardComponent, BadgeComponent, SearchBarComponent } from '../../../shared/components';
import { LearningMaterial, UserMaterialReference } from '../../../models';
import { combineLatest, forkJoin, of, timeout } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { PullToRefreshDirective } from '../../../shared/directives/pull-to-refresh.directive';

type TabType = 'owned' | 'co-authored' | 'public';

@Component({
  selector: 'app-material-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, PullToRefreshDirective, SkeletonLoaderComponent, StatCardComponent, BadgeComponent, SearchBarComponent],
  templateUrl: './material-list.component.html',
  styleUrls: ['./material-list.component.scss']
})
export class MaterialListComponent implements OnInit {
  private materialService = inject(LearningMaterialService);
  private participantService = inject(MaterialParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  ownedMaterials = signal<LearningMaterial[]>([]);
  coAuthoredMaterials = signal<LearningMaterial[]>([]);
  publicMaterials = signal<LearningMaterial[]>([]);
  userMaterialRefs = signal<UserMaterialReference[]>([]);
  ownedSearchTerm = signal('');
  coAuthorSearchTerm = signal('');
  publicSearchTerm = signal('');

  filteredOwnedMaterials = computed(() => this.filterByTerm(this.ownedMaterials(), this.ownedSearchTerm()));
  filteredCoAuthoredMaterials = computed(() => this.filterByTerm(this.coAuthoredMaterials(), this.coAuthorSearchTerm()));
  filteredPublicMaterials = computed(() => this.filterByTerm(this.publicMaterials(), this.publicSearchTerm()));

  currentSearchTerm = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return this.ownedSearchTerm();
      case 'co-authored':
        return this.coAuthorSearchTerm();
      case 'public':
        return this.publicSearchTerm();
    }
  });

  searchPlaceholder = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return 'materials.list.searchPlaceholder.owned';
      case 'co-authored':
        return 'materials.list.searchPlaceholder.coAuthored';
      case 'public':
        return 'materials.list.searchPlaceholder.public';
    }
  });

  activeTab = signal<TabType>('owned');
  isLoading = signal(true);
  error = signal<string | null>(null);

  displayedMaterialCount = computed(() => this.displayedMaterials().length);
  totalContentSize = computed(() => {
    const bytes = this.displayedMaterials().reduce((sum, m) => sum + (m.contentSize || 0), 0);
    return this.formatBytes(bytes);
  });
  latestUpdatedDate = computed<Date | null>(() => {
    const materials = this.displayedMaterials();
    if (!materials.length) return null;

    return materials.reduce((latest, material) =>
      material.updatedAt.getTime() > latest.getTime() ? material.updatedAt : latest,
      materials[0].updatedAt
    );
  });

  currentUser = this.authService.currentUser;
  enrollmentState = signal<Record<string, 'idle' | 'loading' | 'removing' | 'error'>>({});
  joinCode = signal('');
  joinError = signal<string | null>(null);
  joinBusy = signal(false);
  fabOpen = signal(false);

  userMaterialRoleMap = computed(() => {
    const map = new Map<string, UserMaterialReference['role']>();
    this.userMaterialRefs().forEach(ref => map.set(ref.materialId, ref.role));
    return map;
  });

  displayedMaterials = computed(() => {
    switch (this.activeTab()) {
      case 'owned':
        return this.filteredOwnedMaterials();
      case 'co-authored':
        return this.filteredCoAuthoredMaterials();
      case 'public':
        return this.filteredPublicMaterials();
    }
  });

  ngOnInit(): void {
    this.loadMaterials();
  }

  private loadMaterials(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    const QUERY_TIMEOUT = 8000;
    const TOTAL_TIMEOUT = 15000;

    combineLatest([
      this.materialService.getMaterialsForUser(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading owned materials:', error);
          return of([] as LearningMaterial[]);
        })
      ),
      this.participantService.getUserMaterials(userId).pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading user material refs:', error);
          return of([] as UserMaterialReference[]);
        })
      ),
      this.materialService.getPublicMaterials().pipe(
        timeout(QUERY_TIMEOUT),
        catchError(error => {
          console.error('Error loading public materials:', error);
          return of([] as LearningMaterial[]);
        })
      )
    ]).pipe(
      timeout(TOTAL_TIMEOUT),
      takeUntilDestroyed(this.destroyRef),
      switchMap(([owned, userMaterialRefs, publicMaterials]) => {
        this.ownedMaterials.set(owned.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
        this.userMaterialRefs.set(userMaterialRefs);

        const coAuthorRefs = userMaterialRefs.filter(ref => ref.role === 'co-author');
        const studentRefs = userMaterialRefs.filter(ref => ref.role === 'student');

        const coAuthorIds = coAuthorRefs.map(ref => ref.materialId);
        const studentIds = studentRefs.map(ref => ref.materialId);

        const coAuthor$ = coAuthorIds.length > 0
          ? this.materialService.getMaterialsByIds(coAuthorIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading co-author materials:', error);
                return of([] as LearningMaterial[]);
              })
            )
          : of([] as LearningMaterial[]);

        const student$ = studentIds.length > 0
          ? this.materialService.getMaterialsByIds(studentIds).pipe(
              timeout(QUERY_TIMEOUT),
              catchError(error => {
                console.error('Error loading student materials:', error);
                return of([] as LearningMaterial[]);
              })
            )
          : of([] as LearningMaterial[]);

        return forkJoin([coAuthor$, student$]).pipe(
          timeout(QUERY_TIMEOUT),
          map(([coAuthorMaterials, studentMaterials]) => ({
            coAuthorMaterials,
            studentMaterials,
            publicMaterials
          })),
          catchError(error => {
            console.error('Error loading co-author/student materials:', error);
            return of({ coAuthorMaterials: [] as LearningMaterial[], studentMaterials: [] as LearningMaterial[], publicMaterials });
          })
        );
      }),
      catchError(error => {
        console.error('Critical error in material loading:', error);
        this.error.set('Failed to load materials. Please refresh the page.');
        this.isLoading.set(false);
        return of({ coAuthorMaterials: [] as LearningMaterial[], studentMaterials: [] as LearningMaterial[], publicMaterials: [] as LearningMaterial[] });
      })
    ).subscribe({
      next: ({ coAuthorMaterials, studentMaterials, publicMaterials }) => {
        this.coAuthoredMaterials.set(coAuthorMaterials.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        const publicMaterialIds = new Set(publicMaterials.map(m => m.id));
        const uniqueStudentMaterials = studentMaterials.filter(m => !publicMaterialIds.has(m.id));

        const allPublicMaterials = [...publicMaterials, ...uniqueStudentMaterials];
        this.publicMaterials.set(allPublicMaterials.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Unexpected error:', err);
        this.error.set('An unexpected error occurred.');
        this.isLoading.set(false);
      }
    });
  }

  setActiveTab(tab: TabType): void {
    this.activeTab.set(tab);
  }

  onRefresh(): void {
    console.log('Pull-to-refresh triggered');
    this.loadMaterials();
  }

  onSearch(term: string): void {
    switch (this.activeTab()) {
      case 'owned':
        this.ownedSearchTerm.set(term);
        break;
      case 'co-authored':
        this.coAuthorSearchTerm.set(term);
        break;
      case 'public':
        this.publicSearchTerm.set(term);
        break;
    }
  }

  clearSearch(): void {
    switch (this.activeTab()) {
      case 'owned':
        this.ownedSearchTerm.set('');
        break;
      case 'co-authored':
        this.coAuthorSearchTerm.set('');
        break;
      case 'public':
        this.publicSearchTerm.set('');
        break;
    }
  }

  toggleFab(): void {
    this.fabOpen.update(open => !open);
  }

  private filterByTerm(materials: LearningMaterial[], term: string): LearningMaterial[] {
    const needle = term.trim().toLowerCase();
    if (!needle) return materials;

    return materials.filter(material => {
      const titleMatch = material.title.toLowerCase().includes(needle);
      const descriptionMatch = (material.description || '').toLowerCase().includes(needle);
      return titleMatch || descriptionMatch;
    });
  }

  createNewMaterial(): void {
    this.router.navigate(['/lernen/material-editor', 'new']);
  }

  editMaterial(materialId: string): void {
    this.router.navigate(['/lernen/material-editor', materialId]);
  }

  viewMaterial(materialId: string): void {
    this.router.navigate(['/lernen/material', materialId]);
  }

  requiresEnrollment(material: LearningMaterial): boolean {
    return material.visibility === 'public' && !this.isOwner(material) && !this.isCoAuthor(material);
  }

  isEnrolled(materialId: string): boolean {
    return this.userMaterialRoleMap().get(materialId) === 'student';
  }

  isCoAuthor(material: LearningMaterial): boolean {
    return this.userMaterialRoleMap().get(material.id) === 'co-author';
  }

  isEnrolling(materialId: string): boolean {
    return this.enrollmentState()[materialId] === 'loading';
  }

  isUnenrolling(materialId: string): boolean {
    return this.enrollmentState()[materialId] === 'removing';
  }

  isEnrollmentBusy(materialId: string): boolean {
    const state = this.enrollmentState()[materialId];
    return state === 'loading' || state === 'removing';
  }

  private updateEnrollmentState(materialId: string, state: 'idle' | 'loading' | 'removing' | 'error'): void {
    this.enrollmentState.update(current => ({ ...current, [materialId]: state }));
  }

  async enrollInMaterial(material: LearningMaterial): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.requiresEnrollment(material) || this.isEnrolled(material.id) || this.isEnrolling(material.id)) {
      return;
    }

    const optimisticRef: UserMaterialReference = {
      materialId: material.id,
      role: 'student',
      addedAt: new Date(),
      lastAccessedAt: new Date()
    };

    this.userMaterialRefs.update(refs => [...refs, optimisticRef]);
    this.updateEnrollmentState(material.id, 'loading');

    try {
      await this.participantService.addParticipant(
        material.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );

      this.updateEnrollmentState(material.id, 'idle');
      this.toastService.success(`"${material.title}" hinzugefügt`);
    } catch (err) {
      console.error('Error enrolling in material:', err);
      this.userMaterialRefs.update(refs => refs.filter(ref => ref.materialId !== material.id));
      this.updateEnrollmentState(material.id, 'error');
      this.toastService.error('Lernunterlage konnte nicht hinzugefügt werden');
    }
  }

  async unenrollFromMaterial(material: LearningMaterial): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.isEnrolled(material.id) || this.isUnenrolling(material.id)) {
      return;
    }

    const previousRefs = this.userMaterialRefs();

    this.userMaterialRefs.update(refs => refs.filter(ref => ref.materialId !== material.id));
    this.updateEnrollmentState(material.id, 'removing');

    try {
      await this.participantService.removeParticipant(material.id, user.uid);

      this.updateEnrollmentState(material.id, 'idle');
      this.toastService.success(`"${material.title}" entfernt`);
    } catch (err) {
      console.error('Error removing material enrollment:', err);
      this.userMaterialRefs.set(previousRefs);
      this.updateEnrollmentState(material.id, 'error');
      this.toastService.error('Lernunterlage konnte nicht entfernt werden');
    }
  }

  async deleteMaterial(material: LearningMaterial): Promise<void> {
    if (!confirm(`Möchtest du "${material.title}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    try {
      await this.materialService.deleteMaterialWithCleanup(
        material.id,
        this.participantService
      );
      this.ownedMaterials.update(materials => materials.filter(m => m.id !== material.id));
      this.toastService.success(`"${material.title}" wurde gelöscht`);
    } catch (err: any) {
      console.error('Error deleting material:', err);
      this.toastService.error(`Löschen fehlgeschlagen: ${err.message}`, 5000);
    }
  }

  canEdit(material: LearningMaterial): boolean {
    const userId = this.currentUser()?.uid;
    if (!userId) return false;

    return userId === material.ownerId || this.isCoAuthor(material);
  }

  isOwner(material: LearningMaterial): boolean {
    return this.currentUser()?.uid === material.ownerId;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async joinByCode(): Promise<void> {
    const code = this.joinCode().trim();
    const user = this.currentUser();

    if (!code) {
      this.joinError.set('Bitte gib einen Code ein.');
      return;
    }

    if (!user) {
      this.joinError.set('Du musst angemeldet sein.');
      return;
    }

    this.joinBusy.set(true);
    this.joinError.set(null);

    try {
      const material = await new Promise<LearningMaterial | null>((resolve, reject) => {
        this.materialService.getMaterialByJoinCode(code).subscribe({
          next: resolve,
          error: reject
        });
      });

      if (!material) {
        this.joinError.set('Keine Lernunterlage mit diesem Code gefunden.');
        this.joinBusy.set(false);
        return;
      }

      const existingRef = this.userMaterialRefs().find(ref => ref.materialId === material.id);
      if (existingRef) {
        this.joinError.set('Du hast bereits Zugriff auf diese Lernunterlage.');
        this.joinBusy.set(false);
        return;
      }

      await this.participantService.addParticipant(
        material.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );

      const newRef: UserMaterialReference = {
        materialId: material.id,
        role: 'student',
        addedAt: new Date(),
        lastAccessedAt: new Date()
      };

      this.userMaterialRefs.update(refs => [...refs, newRef]);

      this.joinCode.set('');
      this.joinError.set(null);
      this.joinBusy.set(false);

      const toggleCheckbox = document.getElementById('join-toggle') as HTMLInputElement;
      if (toggleCheckbox) {
        toggleCheckbox.checked = false;
      }

      this.router.navigate(['/lernen/material', material.id]);
    } catch (err: any) {
      console.error('Error joining material by code:', err);
      this.joinError.set('Fehler beim Beitreten: ' + (err.message || 'Unbekannter Fehler'));
      this.joinBusy.set(false);
    }
  }

  async copyJoinCode(material: LearningMaterial): Promise<void> {
    if (!material.joinCode) return;

    try {
      await navigator.clipboard.writeText(material.joinCode);
      this.toastService.success(`Code "${material.joinCode}" kopiert!`);
    } catch (err) {
      console.error('Failed to copy join code:', err);
      this.toastService.error('Kopieren fehlgeschlagen');
    }
  }
}
