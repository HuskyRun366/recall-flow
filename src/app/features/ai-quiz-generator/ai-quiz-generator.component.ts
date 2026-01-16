import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GeminiService } from '../../core/services/gemini.service';
import { FileProcessingService } from '../../core/services/file-processing.service';
import { FirestoreService } from '../../core/services/firestore.service';
import { QuestionService } from '../../core/services/question.service';
import { AuthService } from '../../core/services/auth.service';
import { FollowService } from '../../core/services/follow.service';
import { ToonParser } from '../../shared/utils/toon-parser';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-ai-quiz-generator',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './ai-quiz-generator.component.html',
  styleUrls: ['./ai-quiz-generator.component.scss']
})
export class AiQuizGeneratorComponent implements OnInit {
  private geminiService = inject(GeminiService);
  readonly fileProcessingService = inject(FileProcessingService);
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private authService = inject(AuthService);
  private followService = inject(FollowService);
  private router = inject(Router);

  // State
  selectedFiles = signal<File[]>([]);
  isGenerating = signal(false);
  generationProgress = signal('');
  error = signal<string | null>(null);
  errorParams = signal<Record<string, any>>({});
  retryCount = signal(0);
  maxRetries = 3;
  generatedToon = signal<string | null>(null);
  isDraggingOver = signal(false);
  questionCount = signal(7);
  multipleChoicePercent = signal(60);
  orderingPercent = signal(25);
  matchingPercent = signal(15);
  teacherStyle = signal<'relaxed' | 'balanced' | 'demanding' | 'strict'>('balanced');
  promptVisible = signal(false);
  promptCopied = signal(false);
  promptText = computed(() =>
    this.geminiService.getQuizPrompt(
      this.questionCount(),
      this.multipleChoicePercent(),
      this.orderingPercent(),
      this.matchingPercent(),
      this.teacherStyle()
    )
  );

  // Teacher style options
  teacherStyles = [
    {
      id: 'relaxed' as const,
      emoji: '😊',
      nameKey: 'aiGenerator.teacherStyles.relaxed.name',
      descriptionKey: 'aiGenerator.teacherStyles.relaxed.description'
    },
    {
      id: 'balanced' as const,
      emoji: '⚖️',
      nameKey: 'aiGenerator.teacherStyles.balanced.name',
      descriptionKey: 'aiGenerator.teacherStyles.balanced.description'
    },
    {
      id: 'demanding' as const,
      emoji: '🎯',
      nameKey: 'aiGenerator.teacherStyles.demanding.name',
      descriptionKey: 'aiGenerator.teacherStyles.demanding.description'
    },
    {
      id: 'strict' as const,
      emoji: '📐',
      nameKey: 'aiGenerator.teacherStyles.strict.name',
      descriptionKey: 'aiGenerator.teacherStyles.strict.description'
    }
  ];

  // Config
  maxFiles = environment.gemini.maxFiles;
  maxFileSizeMB = environment.gemini.maxFileSizeMB;

  currentUser = this.authService.currentUser;

  ngOnInit(): void {
    if (!environment.gemini.enabled) {
      this.error.set('aiGenerator.errors.notEnabled');
      this.errorParams.set({});
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);

    // Validate file count
    if (files.length > this.maxFiles) {
      this.error.set('aiGenerator.errors.maxFiles');
      this.errorParams.set({ maxFiles: this.maxFiles });
      return;
    }

    // Validate each file
    for (const file of files) {
      const validationError = this.fileProcessingService.validateFile(file, this.maxFileSizeMB);
      if (validationError) {
        this.error.set(validationError.key);
        this.errorParams.set(validationError.params || {});
        return;
      }
    }

    this.selectedFiles.set(files);
    this.error.set(null);
    this.errorParams.set({});
  }

  removeFile(index: number): void {
    const files = this.selectedFiles();
    files.splice(index, 1);
    this.selectedFiles.set([...files]);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);

    if (!event.dataTransfer?.files) return;

    const files = Array.from(event.dataTransfer.files);

    // Validate file count
    if (files.length > this.maxFiles) {
      this.error.set('aiGenerator.errors.maxFiles');
      this.errorParams.set({ maxFiles: this.maxFiles });
      return;
    }

    // Validate each file
    for (const file of files) {
      const validationError = this.fileProcessingService.validateFile(file, this.maxFileSizeMB);
      if (validationError) {
        this.error.set(validationError.key);
        this.errorParams.set(validationError.params || {});
        return;
      }
    }

    this.selectedFiles.set(files);
    this.error.set(null);
    this.errorParams.set({});
  }

  onMultipleChoicePercentChange(value: number): void {
    this.multipleChoicePercent.set(value);
    this.redistribute('mc');
  }

  onOrderingPercentChange(value: number): void {
    this.orderingPercent.set(value);
    this.redistribute('ord');
  }

  onMatchingPercentChange(value: number): void {
    this.matchingPercent.set(value);
    this.redistribute('match');
  }

  /**
   * Keep the three sliders summing to 100 by redistributing the remaining share
   * proportionally to the two untouched sliders.
   */
  private redistribute(changed: 'mc' | 'ord' | 'match'): void {
    const mc = this.multipleChoicePercent();
    const ord = this.orderingPercent();
    const match = this.matchingPercent();

    const current = { mc, ord, match } as const;
    const total = mc + ord + match;

    if (total === 100) return;

    const remaining = 100 - current[changed];
    const keys = ['mc', 'ord', 'match'] as const;
    const others = keys.filter(k => k !== changed);
    const sumOthers = others.reduce((sum, k) => sum + current[k], 0);

    const share = sumOthers === 0 ? remaining / 2 : undefined;

    const newValues: Record<typeof keys[number], number> = { mc, ord, match } as any;

    others.forEach((k, idx) => {
      const portion = sumOthers === 0
        ? share!
        : Math.round(remaining * (current[k] / sumOthers));
      newValues[k] = portion;

      // ensure last one closes the gap to 100 exactly
      if (idx === others.length - 1) {
        const accumulated = others.slice(0, idx).reduce((sum, key) => sum + newValues[key], 0);
        newValues[k] = remaining - accumulated;
      }
    });

    newValues[changed] = current[changed];

    this.multipleChoicePercent.set(newValues.mc);
    this.orderingPercent.set(newValues.ord);
    this.matchingPercent.set(newValues.match);
  }

  async generateQuiz(): Promise<void> {
    const files = this.selectedFiles();
    if (files.length === 0) {
      this.error.set('aiGenerator.errors.selectAtLeastOne');
      this.errorParams.set({});
      return;
    }

    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('aiGenerator.errors.mustBeSignedIn');
      this.errorParams.set({});
      return;
    }

    this.isGenerating.set(true);
    this.error.set(null);
    this.errorParams.set({});
    this.generationProgress.set('aiGenerator.progress.processingFiles');

    try {
      // Step 1: Process files
      const processedFiles = await this.fileProcessingService.processFiles(files).toPromise();
      if (!processedFiles) throw new Error('File processing failed');

      this.generationProgress.set('aiGenerator.progress.generating');

      // Distribute a portion of ordering questions to matching (40% of ordering share)
      const rawMc = this.multipleChoicePercent();
      const rawOrd = this.orderingPercent();
      const matchingPercent = Math.min(100 - rawMc, Math.max(0, Math.round(rawOrd * 0.4)));
      const orderingPercent = rawOrd - matchingPercent;

      // Step 2: Call Gemini API
      const toonContent = await new Promise<string>((resolve, reject) => {
        this.geminiService.generateQuizFromFiles(
          processedFiles,
          this.questionCount(),
          this.multipleChoicePercent(),
          this.orderingPercent(),
          this.matchingPercent(),
          this.teacherStyle()
        ).subscribe({
          next: resolve,
          error: reject
        });
      });

      this.generatedToon.set(toonContent);
      this.generationProgress.set('aiGenerator.progress.validatingToon');

      // Step 3: Parse TOON
      const parsed = ToonParser.parse(toonContent);

      if (!parsed.quiz.title) {
        throw new Error('Generated TOON is missing quiz title');
      }

      if (parsed.questions.length === 0) {
        throw new Error('At least one question is required');
      }

      this.generationProgress.set('aiGenerator.progress.savingQuiz');

      // Step 4: Create Quiz in Firestore
      const quizData = {
        title: parsed.quiz.title || 'Untitled Quiz',
        description: parsed.quiz.description || '',
        visibility: parsed.quiz.visibility || 'private',
        ownerId: userId,
        questionCount: parsed.questions.length,
        metadata: {
          totalParticipants: 0,
          totalCompletions: 0
        }
      };

      const quizId = await new Promise<string>((resolve, reject) => {
        this.firestoreService.createQuiz(quizData).subscribe({
          next: resolve,
          error: reject
        });
      });

      // Step 5: Create Questions
      const questionsWithQuizId = parsed.questions.map((q, index) => ({
        ...q,
        quizId,
        orderIndex: index,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      await this.questionService.createQuestionsBatch(questionsWithQuizId);

      // Notify followers if the new quiz is public
      if (quizData.visibility === 'public' && userId) {
        this.followService.notifyFollowers(quizId, quizData.title, userId)
          .catch(err => console.error('Failed to notify followers:', err));
      }

      // Step 6: Navigate to editor
      this.generationProgress.set('aiGenerator.progress.openingQuiz');
      await this.router.navigate(['/quiz', 'editor', quizId]);

    } catch (err: any) {
      console.error('Generation error:', err);

      const message = err?.message as string | undefined;

      if (this.retryCount() < this.maxRetries) {
        if (message) {
          this.error.set('aiGenerator.errors.generationFailedRetry');
          this.errorParams.set({ message });
        } else {
          this.error.set('aiGenerator.errors.generationFailedRetryGeneric');
          this.errorParams.set({});
        }
        this.retryCount.update(c => c + 1);
        this.isGenerating.set(false);
      } else {
        if (message) {
          this.error.set('aiGenerator.errors.generationFailed');
          this.errorParams.set({ maxRetries: this.maxRetries, message });
        } else {
          this.error.set('aiGenerator.errors.generationFailedGeneric');
          this.errorParams.set({ maxRetries: this.maxRetries });
        }
        this.isGenerating.set(false);
      }
    }
  }

  retry(): void {
    this.error.set(null);
    this.errorParams.set({});
    this.retryCount.set(0);
    this.generateQuiz();
  }

  cancel(): void {
    this.router.navigate(['/quiz', 'home']);
  }

  getTotalSize(): string {
    const files = this.selectedFiles();
    const totalBytes = this.fileProcessingService.getTotalSize(files);
    return this.fileProcessingService.formatFileSize(totalBytes);
  }

  togglePrompt(): void {
    this.promptVisible.update(value => !value);
  }

  async copyPrompt(): Promise<void> {
    const text = this.promptText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.promptCopied.set(true);
      setTimeout(() => this.promptCopied.set(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  }
}
