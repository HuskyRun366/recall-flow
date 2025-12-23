import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GeminiService } from '../../core/services/gemini.service';
import { FileProcessingService } from '../../core/services/file-processing.service';
import { LearningMaterialService } from '../../core/services/learning-material.service';
import { MaterialParticipantService } from '../../core/services/material-participant.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface GeneratedMaterial {
  title: string;
  description: string;
  html: string;
}

@Component({
  selector: 'app-ai-material-generator',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './ai-material-generator.component.html',
  styleUrls: ['./ai-material-generator.component.scss']
})
export class AiMaterialGeneratorComponent implements OnInit {
  private geminiService = inject(GeminiService);
  readonly fileProcessingService = inject(FileProcessingService);
  private materialService = inject(LearningMaterialService);
  private participantService = inject(MaterialParticipantService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // State
  selectedFiles = signal<File[]>([]);
  isGenerating = signal(false);
  generationProgress = signal('');
  error = signal<string | null>(null);
  errorParams = signal<Record<string, any>>({});
  retryCount = signal(0);
  maxRetries = 3;
  isDraggingOver = signal(false);

  sectionCount = signal(6);
  autoSections = signal(true);
  interactivityLevel = signal<'low' | 'medium' | 'high'>('medium');
  materialStyle = signal<'concise' | 'balanced' | 'detailed'>('balanced');

  materialStyles = [
    {
      id: 'concise' as const,
      emoji: '🧠',
      nameKey: 'aiMaterialGenerator.styles.concise.name',
      descriptionKey: 'aiMaterialGenerator.styles.concise.description'
    },
    {
      id: 'balanced' as const,
      emoji: '⚡',
      nameKey: 'aiMaterialGenerator.styles.balanced.name',
      descriptionKey: 'aiMaterialGenerator.styles.balanced.description'
    },
    {
      id: 'detailed' as const,
      emoji: '🔍',
      nameKey: 'aiMaterialGenerator.styles.detailed.name',
      descriptionKey: 'aiMaterialGenerator.styles.detailed.description'
    }
  ];

  interactivityOptions = [
    {
      id: 'low' as const,
      emoji: '📄',
      nameKey: 'aiMaterialGenerator.interactivity.low.name',
      descriptionKey: 'aiMaterialGenerator.interactivity.low.description'
    },
    {
      id: 'medium' as const,
      emoji: '🎛️',
      nameKey: 'aiMaterialGenerator.interactivity.medium.name',
      descriptionKey: 'aiMaterialGenerator.interactivity.medium.description'
    },
    {
      id: 'high' as const,
      emoji: '🧩',
      nameKey: 'aiMaterialGenerator.interactivity.high.name',
      descriptionKey: 'aiMaterialGenerator.interactivity.high.description'
    }
  ];

  maxFiles = environment.gemini.maxFiles;
  maxFileSizeMB = environment.gemini.maxFileSizeMB;

  currentUser = this.authService.currentUser;

  ngOnInit(): void {
    if (!environment.gemini.enabled) {
      this.error.set('aiMaterialGenerator.errors.notEnabled');
      this.errorParams.set({});
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const files = Array.from(input.files);

    if (files.length > this.maxFiles) {
      this.error.set('aiMaterialGenerator.errors.maxFiles');
      this.errorParams.set({ maxFiles: this.maxFiles });
      return;
    }

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

    if (files.length > this.maxFiles) {
      this.error.set('aiMaterialGenerator.errors.maxFiles');
      this.errorParams.set({ maxFiles: this.maxFiles });
      return;
    }

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

  async generateMaterial(): Promise<void> {
    const files = this.selectedFiles();
    if (files.length === 0) {
      this.error.set('aiMaterialGenerator.errors.selectAtLeastOne');
      this.errorParams.set({});
      return;
    }

    const userId = this.currentUser()?.uid;
    if (!userId) {
      this.error.set('aiMaterialGenerator.errors.mustBeSignedIn');
      this.errorParams.set({});
      return;
    }

    this.isGenerating.set(true);
    this.error.set(null);
    this.errorParams.set({});
    this.generationProgress.set('aiMaterialGenerator.progress.processingFiles');

    try {
      const processedFiles = await this.fileProcessingService.processFiles(files).toPromise();
      if (!processedFiles) throw new Error('File processing failed');

      this.generationProgress.set('aiMaterialGenerator.progress.generating');

      const selectedSectionCount = this.autoSections() ? null : this.sectionCount();

      const generated = await new Promise<GeneratedMaterial>((resolve, reject) => {
        this.geminiService.generateLearningMaterialFromFiles(
          processedFiles,
          selectedSectionCount,
          this.interactivityLevel(),
          this.materialStyle()
        ).subscribe({
          next: resolve,
          error: reject
        });
      });

      if (!generated?.title || !generated?.html) {
        throw new Error('Invalid AI response');
      }

      const htmlContent = this.ensureHtmlDocument(generated.html);
      const description = generated.description || '';

      this.generationProgress.set('aiMaterialGenerator.progress.savingMaterial');

      const materialData: any = {
        title: generated.title,
        description,
        ownerId: userId,
        visibility: 'private',
        htmlContent: htmlContent,
        contentSize: new Blob([htmlContent]).size,
        tags: [],
        metadata: { totalStudents: 0, totalViews: 0 }
      };

      const materialId = await new Promise<string>((resolve, reject) => {
        this.materialService.createMaterial(materialData).subscribe({
          next: resolve,
          error: reject
        });
      });

      const userEmail = this.currentUser()?.email || '';
      await this.participantService.addParticipant(
        materialId,
        userId,
        userEmail,
        'owner',
        undefined,
        'accepted'
      );

      this.generationProgress.set('aiMaterialGenerator.progress.openingMaterial');
      await this.router.navigate(['/lernen/material-editor', materialId]);
    } catch (err: any) {
      console.error('Material generation error:', err);

      const message = err?.message as string | undefined;

      if (this.retryCount() < this.maxRetries) {
        if (message) {
          this.error.set('aiMaterialGenerator.errors.generationFailedRetry');
          this.errorParams.set({ message });
        } else {
          this.error.set('aiMaterialGenerator.errors.generationFailedRetryGeneric');
          this.errorParams.set({});
        }
        this.retryCount.update(c => c + 1);
        this.isGenerating.set(false);
      } else {
        if (message) {
          this.error.set('aiMaterialGenerator.errors.generationFailed');
          this.errorParams.set({ maxRetries: this.maxRetries, message });
        } else {
          this.error.set('aiMaterialGenerator.errors.generationFailedGeneric');
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
    this.generateMaterial();
  }

  cancel(): void {
    this.router.navigate(['/lernen/materials']);
  }

  getTotalSize(): string {
    const files = this.selectedFiles();
    const totalBytes = this.fileProcessingService.getTotalSize(files);
    return this.fileProcessingService.formatFileSize(totalBytes);
  }

  private ensureHtmlDocument(html: string): string {
    const trimmed = html.trim();
    if (/<html[\s>]/i.test(trimmed)) {
      return trimmed;
    }

    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>Learning Material</title>\n</head>\n<body>\n${trimmed}\n</body>\n</html>`;
  }
}
