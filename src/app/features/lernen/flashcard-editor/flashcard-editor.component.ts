import { Component, OnInit, signal, inject, DestroyRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FlashcardDeckService } from '../../../core/services/flashcard-deck.service';
import { FlashcardService } from '../../../core/services/flashcard.service';
import { FlashcardProgressService } from '../../../core/services/flashcard-progress.service';
import { DeckParticipantService } from '../../../core/services/deck-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { FlashcardDeck, Flashcard } from '../../../models';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ImportDialogComponent } from '../../quiz-editor/components/import-dialog/import-dialog.component';
import { ImportedQuestion } from '../../../core/services/import.service';

interface CardFormData {
  id?: string;
  front: string;
  back: string;
  frontImageUrl?: string;
  backImageUrl?: string;
  isNew?: boolean;
}

@Component({
  selector: 'app-flashcard-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule, DragDropModule, ImportDialogComponent],
  templateUrl: './flashcard-editor.component.html',
  styleUrls: ['./flashcard-editor.component.scss']
})
export class FlashcardEditorComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private deckService = inject(FlashcardDeckService);
  private cardService = inject(FlashcardService);
  private progressService = inject(FlashcardProgressService);
  private participantService = inject(DeckParticipantService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  deckForm!: FormGroup;
  cards = signal<CardFormData[]>([]);
  deck = signal<FlashcardDeck | null>(null);
  isLoading = signal(true);
  isSaving = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  unsavedChanges = signal(false);
  showImportDialog = signal(false);
  selectedCardIndex = signal<number | null>(null);

  deckId = signal<string | null>(null);
  isNewDeck = computed(() => this.deckId() === null || this.deckId() === 'new');
  currentUser = this.authService.currentUser;

  canEdit = signal(true); // Will be set based on user permissions

  ngOnInit(): void {
    this.initializeForm();
    this.loadDeckData();
  }

  private initializeForm(): void {
    this.deckForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      tags: [''], // Comma-separated string
      visibility: ['private', Validators.required]
    });

    // Track unsaved changes
    this.deckForm.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.unsavedChanges.set(true);
      });
  }

  private loadDeckData(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id || id === 'new') {
      this.deckId.set(null);
      this.isLoading.set(false);
      this.cards.set([]);

      // Set default values for new deck
      const userId = this.currentUser()?.uid;
      if (userId) {
        this.deck.set({
          title: 'Default',
          description: '',
          ownerId: userId,
          visibility: 'private',
          cardCount: 0,
          tags: [],
          metadata: {
            totalStudents: 0,
            totalCompletions: 0
          },
          createdAt: new Date(),
          updatedAt: new Date()
        } as any);

        // Populate form with default values
        this.deckForm.patchValue({
          title: 'Default',
          description: '',
          tags: '',
          visibility: 'private'
        }, { emitEvent: false });
      }

      return;
    }

    this.deckId.set(id);
    this.isLoading.set(true);

    // Load deck and cards
    this.deckService.getDeckById(id).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(async deck => {
        if (!deck) {
          throw new Error('Deck not found');
        }

        // Store deck
        this.deck.set(deck);

        // Check permissions
        const userId = this.currentUser()?.uid;
        if (deck.ownerId !== userId) {
          const isCoAuthor = await this.participantService.hasRole(id, userId!, 'co-author');
          this.canEdit.set(isCoAuthor);
          if (!isCoAuthor) {
            throw new Error('You do not have permission to edit this deck');
          }
        } else {
          this.canEdit.set(true);
        }

        // Populate form
        this.deckForm.patchValue({
          title: deck.title,
          description: deck.description,
          tags: deck.tags.join(', '),
          visibility: deck.visibility
        }, { emitEvent: false }); // Don't trigger unsavedChanges on initial load

        return deck;
      }),
      switchMap(() => {
        // Load cards
        return this.cardService.getFlashcardsByDeckId(id);
      }),
      catchError(err => {
        console.error('Error loading deck:', err);
        this.error.set(err.message || 'Failed to load deck');
        return of([]);
      })
    ).subscribe({
      next: (cards) => {
        this.cards.set(cards.map(card => ({
          id: card.id,
          front: card.front,
          back: card.back,
          frontImageUrl: card.frontImageUrl,
          backImageUrl: card.backImageUrl
        })));
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading deck data:', err);
        this.error.set('Failed to load deck. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  async createDeck(): Promise<void> {
    if (this.deckForm.invalid) {
      this.error.set('Please fill in all required fields');
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      const userId = this.currentUser()?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const formValue = this.deckForm.value;
      const tagsArray = formValue.tags
        ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : [];

      const deckData: any = {
        title: formValue.title,
        description: formValue.description || '',
        ownerId: userId,
        visibility: formValue.visibility,
        cardCount: 0,
        tags: tagsArray,
        metadata: {
          totalStudents: 0,
          totalCompletions: 0
        }
      };

      // Only add joinCode for unlisted decks to avoid undefined values in Firestore
      if (formValue.visibility === 'unlisted') {
        deckData.joinCode = this.deckService.generateJoinCode();
      }

      this.deckService.createDeck(deckData).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: (deckId) => {
          this.deckId.set(deckId);

          // Owner is identified by ownerId field in deck document (no participant record needed)

          this.successMessage.set('Deck created successfully!');
          this.isSaving.set(false);

          // Navigate to the editor for this deck
          this.router.navigate(['/lernen/deck-editor', deckId]);
        },
        error: (err) => {
          console.error('Error creating deck:', err);
          this.error.set('Failed to create deck. Please try again.');
          this.isSaving.set(false);
        }
      });
    } catch (err: any) {
      console.error('Error creating deck:', err);
      this.error.set(err.message || 'Failed to create deck');
      this.isSaving.set(false);
    }
  }

  async saveDeckMetadata(): Promise<void> {
    if (!this.deckId() || this.deckForm.invalid) return;

    this.isSaving.set(true);

    try {
      const formValue = this.deckForm.value;
      const tagsArray = formValue.tags
        ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : [];

      const updates: Partial<FlashcardDeck> = {
        title: formValue.title,
        description: formValue.description || '',
        tags: tagsArray,
        visibility: formValue.visibility
      };

      // Generate join code if changing to unlisted
      if (formValue.visibility === 'unlisted' && !updates.joinCode) {
        updates.joinCode = this.deckService.generateJoinCode();
      }

      this.deckService.updateDeck(this.deckId()!, updates).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: () => {
          this.isSaving.set(false);
          this.unsavedChanges.set(false);
          this.successMessage.set('Changes saved');
          setTimeout(() => this.successMessage.set(null), 2000);
        },
        error: (err) => {
          console.error('Error saving deck:', err);
          this.error.set('Failed to save changes');
          this.isSaving.set(false);
        }
      });
    } catch (err) {
      console.error('Error saving deck:', err);
      this.isSaving.set(false);
    }
  }

  addCard(): void {
    const newCard: CardFormData = {
      front: 'New Card',
      back: 'Answer',
      isNew: true
    };
    this.cards.update(cards => [...cards, newCard]);
    this.unsavedChanges.set(true);
    // Select the newly added card
    this.selectedCardIndex.set(this.cards().length - 1);
  }

  selectCard(index: number): void {
    this.selectedCardIndex.set(index);
  }

  trackByCard(index: number, card: CardFormData): any {
    return card.id || index;
  }

  updateDeckMetadata(field: string, value: any): void {
    const updated = { ...this.deck(), [field]: value };
    this.deck.set(updated as any);
    this.unsavedChanges.set(true);

    // Also update form
    if (field === 'title' || field === 'description' || field === 'visibility') {
      this.deckForm.patchValue({ [field]: value }, { emitEvent: false });
    }
  }

  updateCardField(index: number, field: 'front' | 'back', value: string): void {
    this.cards.update(cards => {
      const updated = [...cards];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    this.unsavedChanges.set(true);
  }

  async deleteCard(index: number): Promise<void> {
    const card = this.cards()[index];

    // If card has an ID, delete from Firestore
    if (card.id && this.deckId()) {
      try {
        await this.cardService.deleteFlashcard(card.id);
        await this.deckService.updateCardCount(this.deckId()!, -1);
        this.successMessage.set('Card deleted');
        setTimeout(() => this.successMessage.set(null), 2000);
      } catch (err) {
        console.error('Error deleting card:', err);
        this.error.set('Failed to delete card');
        return;
      }
    }

    // Remove from local array
    this.cards.update(cards => cards.filter((_, i) => i !== index));
  }

  async saveCard(index: number): Promise<void> {
    const card = this.cards()[index];

    if (!card.front.trim() || !card.back.trim()) {
      this.error.set('Front and back text are required');
      return;
    }

    if (!this.deckId()) {
      // Create deck first
      await this.createDeck();
      if (!this.deckId()) return; // Failed to create deck
    }

    this.isSaving.set(true);

    try {
      if (card.id) {
        // Update existing card
        await this.cardService.updateFlashcard(card.id, {
          front: card.front,
          back: card.back,
          frontImageUrl: card.frontImageUrl,
          backImageUrl: card.backImageUrl
        });
      } else {
        // Create new card
        const cardId = await this.cardService.createFlashcard({
          deckId: this.deckId()!,
          orderIndex: this.cards().length - 1,
          front: card.front,
          back: card.back,
          frontImageUrl: card.frontImageUrl,
          backImageUrl: card.backImageUrl
        });

        // Update local card with ID
        this.cards.update(cards => {
          const updated = [...cards];
          updated[index] = { ...card, id: cardId, isNew: false };
          return updated;
        });

        await this.deckService.updateCardCount(this.deckId()!, 1);
      }

      this.successMessage.set('Card saved');
      setTimeout(() => this.successMessage.set(null), 2000);
      this.isSaving.set(false);
    } catch (err) {
      console.error('Error saving card:', err);
      this.error.set('Failed to save card');
      this.isSaving.set(false);
    }
  }

  async onCardDrop(event: CdkDragDrop<CardFormData[]>): Promise<void> {
    const cardList = this.cards();
    moveItemInArray(cardList, event.previousIndex, event.currentIndex);
    this.cards.set([...cardList]);

    // Save new order to Firestore if deck exists
    if (this.deckId() && cardList.every(c => c.id)) {
      try {
        const cardIds = cardList.map(c => c.id!);
        await this.cardService.reorderFlashcards(this.deckId()!, cardIds);
        this.successMessage.set('Card order updated');
        setTimeout(() => this.successMessage.set(null), 2000);
      } catch (err) {
        console.error('Error reordering cards:', err);
        this.error.set('Failed to update card order');
      }
    }
  }

  async saveDeck(): Promise<void> {
    if (this.isNewDeck()) {
      await this.createDeck();
      return;
    }

    // Save deck metadata and all cards
    this.isSaving.set(true);
    this.error.set(null);

    try {
      // Save deck metadata
      if (this.deckForm.valid) {
        const formValue = this.deckForm.value;
        const tagsArray = formValue.tags
          ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
          : [];

        const updates: Partial<FlashcardDeck> = {
          title: formValue.title,
          description: formValue.description || '',
          tags: tagsArray,
          visibility: formValue.visibility
        };

        if (formValue.visibility === 'unlisted' && !updates.joinCode) {
          updates.joinCode = this.deckService.generateJoinCode();
        }

        await new Promise<void>((resolve, reject) => {
          this.deckService.updateDeck(this.deckId()!, updates).pipe(
            takeUntilDestroyed(this.destroyRef)
          ).subscribe({
            next: () => resolve(),
            error: (err) => reject(err)
          });
        });
      }

      // Save all unsaved cards
      const unsavedCards = this.cards().filter((card, index) =>
        !card.id && card.front.trim() && card.back.trim()
      );

      for (let i = 0; i < this.cards().length; i++) {
        const card = this.cards()[i];
        if (!card.id && card.front.trim() && card.back.trim()) {
          // Create new card
          const cardId = await this.cardService.createFlashcard({
            deckId: this.deckId()!,
            orderIndex: i,
            front: card.front,
            back: card.back,
            frontImageUrl: card.frontImageUrl,
            backImageUrl: card.backImageUrl
          });

          // Update local card with ID
          this.cards.update(cards => {
            const updated = [...cards];
            updated[i] = { ...card, id: cardId, isNew: false };
            return updated;
          });

          await this.deckService.updateCardCount(this.deckId()!, 1);
        }
      }

      this.unsavedChanges.set(false);
      this.successMessage.set('Alle Änderungen gespeichert');
      setTimeout(() => this.successMessage.set(null), 2000);
    } catch (err) {
      console.error('Error saving deck:', err);
      this.error.set('Fehler beim Speichern');
    } finally {
      this.isSaving.set(false);
    }
  }

  retry(): void {
    this.error.set(null);
    this.loadDeckData();
  }

  goBack(): void {
    this.router.navigate(['/lernen']);
  }

  getCardStatus(card: CardFormData): string {
    if (card.isNew && !card.id) return 'New (not saved)';
    if (card.id) return 'Saved';
    return 'Draft';
  }

  openImportDialog(): void {
    this.showImportDialog.set(true);
  }

  closeImportDialog(): void {
    this.showImportDialog.set(false);
  }

  handleImportComplete(importedQuestions: ImportedQuestion[]): void {
    const existingCards = this.cards();

    // Convert imported questions to flashcards
    const newCards: CardFormData[] = importedQuestions.map((imported) => ({
      front: imported.questionText,
      back: imported.correctAnswer,
      isNew: true
    }));

    // Add to existing cards
    this.cards.set([...existingCards, ...newCards]);
    this.unsavedChanges.set(true);
    this.closeImportDialog();
  }

  async deleteDeck(): Promise<void> {
    const deckId = this.deckId();
    if (!deckId) {
      this.error.set('No deck to delete');
      return;
    }

    const deckTitle = this.deck()?.title || 'this deck';
    const confirmed = confirm(`Möchtest du "${deckTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);

    if (!confirmed) {
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      await this.deckService.deleteDeckWithCleanup(
        deckId,
        this.cardService,
        this.progressService,
        this.participantService
      );

      // Navigate back to lernen page
      this.router.navigate(['/lernen']);
    } catch (err) {
      console.error('Error deleting deck:', err);
      this.error.set('Fehler beim Löschen des Decks');
      this.isSaving.set(false);
    }
  }
}
