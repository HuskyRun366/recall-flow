import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { FlashcardDeck, Flashcard, CardProgress } from '../../../models';
import { StatCardComponent, BadgeComponent, LevelBadgeComponent } from '../../../shared/components';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type EnrollState = 'idle' | 'loading' | 'removing';

interface FlashcardWithProgress {
  flashcard: Flashcard;
  progress?: CardProgress;
}

@Component({
  selector: 'app-deck-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, StatCardComponent, BadgeComponent, LevelBadgeComponent],
  templateUrl: './deck-detail.component.html',
  styleUrls: ['./deck-detail.component.scss']
})
export class DeckDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private deckService = inject(FlashcardDeckService);
  private flashcardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private participantService = inject(DeckParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  deck = signal<FlashcardDeck | null>(null);
  flashcards = signal<FlashcardWithProgress[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;
  isEnrolled = signal(false);
  enrollState = signal<EnrollState>('idle');
  canEdit = signal(false);
  copySuccess = signal(false);
  exportSuccess = signal(false);

  requiresEnrollment = computed(() => {
    const d = this.deck();
    const uid = this.currentUser()?.uid;
    if (!d || !uid) return false;
    if (d.ownerId === uid) return false;
    return d.visibility === 'public';
  });

  canStudy = computed(() => {
    if (this.deck()?.visibility !== 'public') return true;
    if (this.canEdit()) return true;
    return this.isEnrolled();
  });

  badgeConfig = computed(() => {
    const d = this.deck();
    if (!d) return null;
    return {
      variant: d.visibility === 'public' ? 'public' as const :
                d.visibility === 'unlisted' ? 'unlisted' as const :
                'private' as const,
      label: d.visibility === 'public' ? 'Öffentlich' :
             d.visibility === 'unlisted' ? 'Nicht gelistet' :
             'Privat'
    };
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Ungültige Deck-ID');
      this.isLoading.set(false);
      return;
    }

    this.deckService.getDeckById(id).subscribe({
      next: (d) => {
        if (!d) {
          this.error.set('Deck nicht gefunden');
          this.isLoading.set(false);
          return;
        }
        this.deck.set(d);
        this.loadFlashcards(id);
        this.loadEnrollment(id);

        // Check edit permission
        const userId = this.currentUser()?.uid;
        if (userId) {
          this.checkCanEdit(d, userId);
        }

        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error(err);
        this.error.set('Fehler beim Laden');
        this.isLoading.set(false);
      }
    });
  }

  private loadFlashcards(deckId: string): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      // Load flashcards without progress
      this.flashcardService.getFlashcardsByDeckId(deckId).subscribe({
        next: (cards: Flashcard[]) => {
          const cardsWithProgress = cards.map(card => ({
            flashcard: card,
            progress: undefined
          }));
          this.flashcards.set(cardsWithProgress);
        },
        error: (err: unknown) => console.error('Karten laden fehlgeschlagen', err)
      });
      return;
    }

    // Load flashcards with progress
    forkJoin([
      this.flashcardService.getFlashcardsByDeckId(deckId),
      this.progressService.getCardProgress(deckId, userId).pipe(
        catchError(() => of([]))
      )
    ]).subscribe({
      next: ([cards, progressArray]) => {
        const progressMap = new Map<string, CardProgress>();
        progressArray.forEach(p => progressMap.set(p.cardId, p));

        const cardsWithProgress = cards.map(card => ({
          flashcard: card,
          progress: progressMap.get(card.id!)
        }));
        this.flashcards.set(cardsWithProgress);
      },
      error: (err: unknown) => console.error('Karten laden fehlgeschlagen', err)
    });
  }

  private loadEnrollment(deckId: string): void {
    const uid = this.currentUser()?.uid;
    if (!uid) return;
    this.participantService.getParticipant(deckId, uid).subscribe({
      next: (p) => this.isEnrolled.set(!!p && (p.role === 'student' || p.role === 'co-author')),
      error: (err) => console.error('Enrollment laden fehlgeschlagen', err)
    });
  }

  private async checkCanEdit(deck: FlashcardDeck, userId: string): Promise<void> {
    if (deck.ownerId === userId) {
      this.canEdit.set(true);
      return;
    }

    // Check if user is co-author
    const isCoAuthor = await this.participantService.canEdit(deck.id, userId);
    this.canEdit.set(isCoAuthor);
  }

  async enroll(): Promise<void> {
    const d = this.deck();
    const user = this.currentUser();
    if (!d || !user || this.enrollState() !== 'idle') return;

    this.enrollState.set('loading');
    try {
      await this.participantService.addParticipant(
        d.id,
        user.uid,
        user.email || '',
        'student',
        user.uid,
        'accepted'
      );
      this.isEnrolled.set(true);
      this.toastService.success('Deck hinzugefügt');
    } catch (err) {
      console.error('Enroll failed', err);
      this.toastService.error('Hinzufügen fehlgeschlagen');
    } finally {
      this.enrollState.set('idle');
    }
  }

  async unenroll(): Promise<void> {
    const d = this.deck();
    const user = this.currentUser();
    if (!d || !user || this.enrollState() !== 'idle') return;

    this.enrollState.set('removing');
    try {
      await this.participantService.removeParticipant(d.id, user.uid);
      this.isEnrolled.set(false);
      this.toastService.success('Deck entfernt');
    } catch (err) {
      console.error('Unenroll failed', err);
      this.toastService.error('Entfernen fehlgeschlagen');
    } finally {
      this.enrollState.set('idle');
    }
  }

  startStudy(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/lernen/deck', d.id, 'study']);
  }

  editDeck(): void {
    const d = this.deck();
    if (d) this.router.navigate(['/lernen/deck-editor', d.id]);
  }

  copyJoinCode(): void {
    const code = this.deck()?.joinCode;
    if (!code) return;

    navigator.clipboard.writeText(code).then(
      () => {
        this.copySuccess.set(true);
        this.toastService.success('Code kopiert!');
        setTimeout(() => this.copySuccess.set(false), 2000);
      },
      (err) => {
        console.error('Failed to copy join code:', err);
        this.toastService.error('Fehler beim Kopieren des Codes');
      }
    );
  }

  private formatDeckForExport(deck: FlashcardDeck, flashcards: FlashcardWithProgress[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`DECK: ${deck.title}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Metadata
    if (deck.description) {
      lines.push(`Beschreibung: ${deck.description}`);
    }
    lines.push(`Sichtbarkeit: ${deck.visibility}`);
    lines.push(`Anzahl Karten: ${flashcards.length}`);
    if (deck.tags && deck.tags.length > 0) {
      lines.push(`Tags: ${deck.tags.join(', ')}`);
    }
    lines.push('');
    lines.push('='.repeat(80));

    // Flashcards
    flashcards.forEach((item, index) => {
      const card = item.flashcard;
      const progress = item.progress;

      lines.push('');
      lines.push(`Karte ${index + 1}`);
      lines.push('');
      lines.push(`Vorderseite: ${card.front}`);
      lines.push(`Rückseite: ${card.back}`);

      if (progress) {
        const levelLabels = ['Nicht trainiert', '1x trainiert', '2x trainiert', 'Perfekt trainiert'];
        lines.push(`Fortschritt: ${levelLabels[progress.level]}`);
      }

      // Separator between cards
      if (index < flashcards.length - 1) {
        lines.push('');
        lines.push('-'.repeat(80));
      }
    });

    // Footer
    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  exportDeck(): void {
    const d = this.deck();
    const cards = this.flashcards();
    if (!d || !cards) return;

    // Menschenlesbaren Export generieren
    const exportContent = this.formatDeckForExport(d, cards);

    // Blob erstellen
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });

    // Download-Link erstellen
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Dateiname: deck-title.txt (Sonderzeichen entfernen)
    const safeTitle = d.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-');
    link.download = `${safeTitle}.txt`;

    // Download triggern
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // Success-Feedback (2 Sekunden)
    this.exportSuccess.set(true);
    setTimeout(() => this.exportSuccess.set(false), 2000);
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }
}
