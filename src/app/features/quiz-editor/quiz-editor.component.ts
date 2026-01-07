import { Component, OnInit, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FirestoreService } from '../../core/services/firestore.service';
import { QuestionService } from '../../core/services/question.service';
import { ParticipantService } from '../../core/services/participant.service';
import { AuthService } from '../../core/services/auth.service';
import { UserLookupService } from '../../core/services/user-lookup.service';
import { FollowService } from '../../core/services/follow.service';
import { ToastService } from '../../core/services/toast.service';
import { Quiz, Question } from '../../models';
import { firstValueFrom } from 'rxjs';
import { ToonEditorComponent } from './components/toon-editor/toon-editor.component';
import { GraphicalEditorComponent } from './components/graphical-editor/graphical-editor.component';

@Component({
  selector: 'app-quiz-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ToonEditorComponent, GraphicalEditorComponent],
  templateUrl: './quiz-editor.component.html',
  styleUrls: ['./quiz-editor.component.scss']
})
export class QuizEditorComponent implements OnInit {
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private userLookupService = inject(UserLookupService);
  private followService = inject(FollowService);
  private toastService = inject(ToastService);
  private translateService = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  quiz = signal<Partial<Quiz> | null>(null);
  questions = signal<Question[]>([]);
  isLoading = signal(true);
  isSaving = signal(false);
  error = signal<string | null>(null);
  editorMode = signal<'toon' | 'graphical'>('graphical');
  unsavedChanges = signal(false);
  coAuthors = signal<string[]>([]);
  coAuthorErrors = signal<string[]>([]);

  currentUser = this.authService.currentUser;
  quizId: string | null = null;

  isOwner = computed(() => {
    const quiz = this.quiz();
    const user = this.currentUser();
    return quiz?.ownerId === user?.uid;
  });

  constructor() {
    // Warn user about unsaved changes
    effect(() => {
      if (this.unsavedChanges()) {
        window.onbeforeunload = () => true;
      } else {
        window.onbeforeunload = null;
      }
    });
  }

  ngOnInit(): void {
    this.quizId = this.route.snapshot.paramMap.get('id');

    if (this.quizId === 'new') {
      this.createNewQuiz();
    } else if (this.quizId) {
      this.loadQuiz(this.quizId);
    } else {
      this.error.set('Invalid quiz ID');
      this.isLoading.set(false);
    }
  }

  private createNewQuiz(): void {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('User not authenticated');
      this.isLoading.set(false);
      return;
    }

    this.quiz.set({
      title: 'Untitled Quiz',
      description: '',
      ownerId: userId,
      visibility: 'private',
      questionCount: 0,
      metadata: {
        totalParticipants: 0,
        totalCompletions: 0
      },
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.questions.set([]);
    this.isLoading.set(false);
  }

  private loadQuiz(id: string): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.firestoreService.getQuizById(id).subscribe({
      next: (quiz) => {
        if (quiz) {
          this.quiz.set(quiz);
          this.checkEditPermission(quiz);
          this.loadQuestions(id);
          this.loadCoAuthors(id);
        } else {
          this.error.set('Quiz not found');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading quiz:', err);
        this.error.set('Failed to load quiz');
        this.isLoading.set(false);
      }
    });
  }

  retry(): void {
    this.error.set(null);
    if (this.quizId && this.quizId !== 'new') {
      this.loadQuiz(this.quizId);
    }
  }

  private loadQuestions(quizId: string): void {
    this.questionService.getQuestionsByQuizId(quizId).subscribe({
      next: (questions) => {
        this.questions.set(questions);
      },
      error: (err) => {
        console.error('Error loading questions:', err);
      }
    });
  }

  private loadCoAuthors(quizId: string): void {
    this.participantService.getParticipantsByQuizId(quizId).subscribe({
      next: (participants) => {
        const coAuthorEmails = participants
          .filter(p => p.role === 'co-author')
          .map(p => p.email);
        this.coAuthors.set(coAuthorEmails);
      },
      error: (err) => {
        console.error('Error loading co-authors:', err);
      }
    });
  }

  private async checkEditPermission(quiz: Quiz): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('You do not have permission to edit this quiz');
      return;
    }

    if (quiz.ownerId !== userId) {
      const canEdit = await this.participantService.canEdit(quiz.id, userId);
      if (!canEdit) {
        this.error.set('You do not have permission to edit this quiz');
      }
    }
  }

  toggleEditorMode(): void {
    this.editorMode.update(mode => mode === 'toon' ? 'graphical' : 'toon');
  }



  onQuizUpdate(updatedQuiz: Partial<Quiz>): void {
    this.quiz.set(updatedQuiz);
    this.unsavedChanges.set(true);
  }

  onCoAuthorsChange(emails: string[]): void {
    this.coAuthors.set(emails);
    this.unsavedChanges.set(true);
    this.coAuthorErrors.set([]);
  }

  async saveQuiz(): Promise<void> {
    const quizData = this.quiz();
    const questionsData = this.questions();

    // Comprehensive validation
    const validationErrors = this.validateQuiz(quizData, questionsData);
    if (validationErrors.length > 0 || !quizData) {
      const errorMessage = validationErrors.length > 0
        ? validationErrors.join(' • ')
        : 'Quiz data is missing';
      this.error.set(errorMessage);
      this.toastService.error(errorMessage);
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    // At this point quizData is guaranteed to be non-null
    const validQuizData = quizData;
    validQuizData.updatedAt = new Date();
    validQuizData.questionCount = questionsData.length;
    this.ensureJoinCode(validQuizData);

    // Remove undefined values (Firestore doesn't accept them)
    const cleanQuizData = this.stripUndefined(quizData);

    try {
      if (this.quizId === 'new') {
        // Create new quiz
        const newId = await firstValueFrom(
          this.firestoreService.createQuiz(cleanQuizData as Omit<Quiz, 'id'>)
        );

        this.quizId = newId;

        // Save questions with the new quiz ID
        const questionsWithQuizId = questionsData.map((q, index) => ({
          ...q,
          quizId: newId,
          orderIndex: index,
          createdAt: new Date(),
          updatedAt: new Date()
        }));

        await this.questionService.createQuestionsBatch(questionsWithQuizId);

        // Save co-authors
        await this.saveCoAuthors(newId);

        // Notify followers if the new quiz is public
        if (cleanQuizData.visibility === 'public' && cleanQuizData.ownerId) {
          this.followService.notifyFollowers(newId, cleanQuizData.title || 'New Quiz', cleanQuizData.ownerId)
            .catch(err => console.error('Failed to notify followers:', err));
        }

        this.router.navigate(['/quiz', 'editor', newId], { replaceUrl: true });
        this.unsavedChanges.set(false);
        this.isSaving.set(false);
        this.toastService.success(this.translateService.instant('toast.quiz.created'));
      } else if (this.quizId) {
        // Update existing quiz
        await firstValueFrom(
          this.firestoreService.updateQuiz(this.quizId!, cleanQuizData)
        );

        // Delete old questions and create new ones
        // Note: In production, you might want a more sophisticated sync algorithm
        await this.questionService.deleteQuestionsByQuizId(this.quizId);

        const questionsWithQuizId = questionsData.map((q, index) => ({
          ...q,
          quizId: this.quizId!,
          orderIndex: index,
          updatedAt: new Date()
        }));

        await this.questionService.createQuestionsBatch(questionsWithQuizId);

        // Save co-authors
        await this.saveCoAuthors(this.quizId);

        // Notify followers if the updated quiz is public
        if (cleanQuizData.visibility === 'public' && cleanQuizData.ownerId) {
          this.followService.notifyFollowersOfQuizUpdate(this.quizId, cleanQuizData.title || 'Quiz', cleanQuizData.ownerId)
            .catch(err => console.error('Failed to notify followers of update:', err));
        }

        this.unsavedChanges.set(false);
        this.isSaving.set(false);
        this.toastService.success(this.translateService.instant('toast.quiz.saved'));
      }
    } catch (err: any) {
      console.error('Error saving quiz:', err);
      this.error.set('Failed to save quiz: ' + err.message);
      this.toastService.error(this.translateService.instant('toast.error.save'));
      this.isSaving.set(false);
    }
  }

  cancel(): void {
    if (this.unsavedChanges() && !confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
    this.router.navigate(['/quiz', 'home']);
  }

  /**
   * Validates quiz and questions before saving.
   * Returns an array of error messages, empty if valid.
   */
  private validateQuiz(quizData: Partial<Quiz> | null, questionsData: Question[]): string[] {
    const errors: string[] = [];

    // Quiz-level validation
    if (!quizData) {
      errors.push('Quiz data is missing');
      return errors;
    }

    if (!quizData.title || quizData.title.trim() === '') {
      errors.push('Quiz must have a title');
    }

    if (questionsData.length === 0) {
      errors.push('Quiz must have at least one question');
      return errors; // No point checking questions if there are none
    }

    // Question-level validation
    questionsData.forEach((question, index) => {
      const qNum = index + 1;

      if (!question.questionText || question.questionText.trim() === '') {
        errors.push(`Question ${qNum}: Missing question text`);
      }

      if (question.type === 'multiple-choice') {
        const options = question.options || [];

        if (options.length < 2) {
          errors.push(`Question ${qNum}: Multiple choice needs at least 2 options`);
        }

        const hasCorrect = options.some(opt => opt.isCorrect);
        if (!hasCorrect && options.length > 0) {
          errors.push(`Question ${qNum}: Multiple choice needs at least one correct answer`);
        }

        const emptyOptions = options.filter(opt => !opt.text || opt.text.trim() === '');
        if (emptyOptions.length > 0) {
          errors.push(`Question ${qNum}: Some options have empty text`);
        }
      }

      if (question.type === 'ordering') {
        const items = question.orderItems || [];

        if (items.length < 2) {
          errors.push(`Question ${qNum}: Ordering question needs at least 2 items`);
        }

        const emptyItems = items.filter(item => !item.text || item.text.trim() === '');
        if (emptyItems.length > 0) {
          errors.push(`Question ${qNum}: Some ordering items have empty text`);
        }
      }

      if (question.type === 'matching') {
        const choices = question.matchingChoices || [];
        const pairs = question.matchingPairs || [];

        if (choices.length < 2) {
          errors.push(`Question ${qNum}: Matching question needs at least 2 dropdown options`);
        }

        if (pairs.length < 2) {
          errors.push(`Question ${qNum}: Matching question needs at least 2 pairs`);
        }

        const emptyChoices = choices.filter(c => !c.text || c.text.trim() === '');
        if (emptyChoices.length > 0) {
          errors.push(`Question ${qNum}: Some matching choices have empty text`);
        }

        const emptyPairs = pairs.filter(p => !p.leftText || p.leftText.trim() === '');
        if (emptyPairs.length > 0) {
          errors.push(`Question ${qNum}: Some matching pairs have empty left text`);
        }

        const validChoiceIds = new Set(choices.map(c => c.id));
        const invalidRefs = pairs.filter(p => !p.correctChoiceId || !validChoiceIds.has(p.correctChoiceId));
        if (invalidRefs.length > 0 && choices.length > 0) {
          errors.push(`Question ${qNum}: Each pair must reference an existing dropdown option`);
        }
      }
    });

    return errors;
  }

  private ensureJoinCode(quiz: Partial<Quiz>): void {
    if (quiz.visibility === 'unlisted' && !quiz.joinCode) {
      quiz.joinCode = this.generateJoinCode();
    }
    if (quiz.visibility !== 'unlisted') {
      quiz.joinCode = undefined;
    }
  }

  private generateJoinCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = (len: number) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return `${part(4)}-${part(4)}`;
  }

  private async saveCoAuthors(quizId: string): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId || !quizId) return;

    const emails = this.coAuthors();
    const errors: string[] = [];

    // Get existing co-authors
    const existingParticipants = await firstValueFrom(
      this.participantService.getParticipantsByQuizId(quizId)
    );
    const existingCoAuthors = existingParticipants.filter(p => p.role === 'co-author');
    const existingEmails = new Set(existingCoAuthors.map(p => p.email));
    const newEmailsSet = new Set(emails);

    // Remove co-authors no longer in list
    const toRemove = existingCoAuthors.filter(p => !newEmailsSet.has(p.email));
    for (const participant of toRemove) {
      try {
        await this.participantService.removeParticipant(quizId, participant.userId);
      } catch (err) {
        console.error(`Failed to remove co-author ${participant.email}:`, err);
      }
    }

    // Add new co-authors
    const toAdd = emails.filter(email => !existingEmails.has(email));
    for (const email of toAdd) {
      // Skip if user tries to add themselves
      if (email === this.currentUser()?.email?.toLowerCase()) {
        continue;
      }

      // Basic email validation
      if (!this.isValidEmail(email)) {
        errors.push(`Invalid email format: ${email}`);
        continue;
      }

      try {
        // Resolve email to userId
        const coAuthorUserId = await this.userLookupService.getUserIdByEmail(email);

        if (!coAuthorUserId) {
          errors.push(`User not found: ${email} (must sign up first)`);
          continue;
        }

        // Add as co-author
        await this.participantService.addParticipant(
          quizId,
          coAuthorUserId,
          email,
          'co-author',
          userId,
          'accepted'
        );
      } catch (err: any) {
        console.error(`Failed to add co-author ${email}:`, err);
        errors.push(`Failed to add ${email}: ${err.message}`);
      }
    }

    // Update error state
    if (errors.length > 0) {
      this.coAuthorErrors.set(errors);
      this.error.set('Some co-authors could not be added. Check the details below.');
    } else {
      this.coAuthorErrors.set([]);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private stripUndefined(obj: any): any {
    const result: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  }
}
