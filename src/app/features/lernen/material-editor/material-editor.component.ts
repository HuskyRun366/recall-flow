import { Component, OnInit, OnDestroy, AfterViewInit, signal, inject, DestroyRef, computed, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { EditorView } from '@codemirror/view';
import { EditorState, StateEffect } from '@codemirror/state';
import { LearningMaterialService } from '../../../core/services/learning-material.service';
import { MaterialParticipantService } from '../../../core/services/material-participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserLookupService } from '../../../core/services/user-lookup.service';
import { ToastService } from '../../../core/services/toast.service';
import { ThemeService } from '../../../core/services/theme.service';
import { CodeMirrorHtmlConfigService } from '../../../shared/services/codemirror-html-config.service';
import { LearningMaterial } from '../../../models';
import { switchMap, catchError } from 'rxjs/operators';
import { firstValueFrom, of } from 'rxjs';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-material-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, ReactiveFormsModule, FormsModule],
  templateUrl: './material-editor.component.html',
  styleUrls: ['./material-editor.component.scss']
})
export class MaterialEditorComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private materialService = inject(LearningMaterialService);
  private participantService = inject(MaterialParticipantService);
  private authService = inject(AuthService);
  private userLookupService = inject(UserLookupService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private themeService = inject(ThemeService);
  private codeMirrorConfig = inject(CodeMirrorHtmlConfigService);

  editorView?: EditorView;

  materialForm!: FormGroup;
  material = signal<LearningMaterial | null>(null);
  htmlContent = signal<string>('');
  sanitizedPreview = signal<SafeHtml | null>(null);

  isLoading = signal(true);
  isSaving = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  unsavedChanges = signal(false);

  materialId = signal<string | null>(null);
  isNewMaterial = computed(() => this.materialId() === null || this.materialId() === 'new');
  currentUser = this.authService.currentUser;

  canEdit = signal(true);
  isOwner = computed(() => this.material()?.ownerId === this.currentUser()?.uid);

  coAuthors = signal<string[]>([]);
  coAuthorErrors = signal<string[]>([]);

  isDragging = signal(false);
  showPreview = signal(false);
  fileName = signal<string | null>(null);
  editorReady = signal(false);

  constructor() {
    // Update editor theme when app theme changes
    effect(() => {
      const isDark = this.themeService.theme() === 'dark';
      this.updateEditorTheme(isDark);
    });
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadMaterialData();
  }

  ngAfterViewInit(): void {
    // Initialize CodeMirror editor after view is ready
    setTimeout(() => {
      this.initializeCodeMirror();
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  private initializeCodeMirror(): void {
    if (!this.editorContainer?.nativeElement) return;

    const isDark = this.themeService.theme() === 'dark';
    const initialContent = this.htmlContent();

    this.editorView = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: this.codeMirrorConfig.getEditorExtensions(
          isDark,
          (content) => this.onCodeMirrorChange(content)
        )
      }),
      parent: this.editorContainer.nativeElement
    });

    this.editorReady.set(true);
  }

  private updateEditorTheme(isDark: boolean): void {
    if (!this.editorView) return;

    this.editorView.dispatch({
      effects: StateEffect.reconfigure.of(
        this.codeMirrorConfig.getEditorExtensions(
          isDark,
          (content) => this.onCodeMirrorChange(content)
        )
      )
    });
  }

  private onCodeMirrorChange(content: string): void {
    this.htmlContent.set(content);
    this.updatePreview(content);
    this.unsavedChanges.set(true);
  }

  private updateEditorContent(content: string): void {
    if (!this.editorView) return;

    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: content
      }
    });
  }

  private initializeForm(): void {
    this.materialForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      tags: [''],
      visibility: ['private', Validators.required]
    });

    this.materialForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.unsavedChanges.set(true);
      });
  }

  private loadMaterialData(): void {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id || id === 'new') {
      this.materialId.set(null);
      this.isLoading.set(false);
      this.htmlContent.set('');
      this.coAuthors.set([]);
      this.coAuthorErrors.set([]);

      const userId = this.currentUser()?.uid;
      if (userId) {
        this.material.set({
          id: '',
          title: 'Neue Lernunterlage',
          description: '',
          ownerId: userId,
          visibility: 'private',
          htmlContent: '',
          contentSize: 0,
          tags: [],
          metadata: { totalStudents: 0, totalViews: 0 },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        this.materialForm.patchValue({
          title: 'Neue Lernunterlage',
          description: '',
          tags: '',
          visibility: 'private'
        }, { emitEvent: false });
      }

      return;
    }

    this.materialId.set(id);
    this.isLoading.set(true);

    this.materialService.getMaterialById(id).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(async material => {
        if (!material) {
          throw new Error('Material not found');
        }

        this.material.set(material);
        this.htmlContent.set(material.htmlContent);
        this.updateEditorContent(material.htmlContent);
        this.updatePreview(material.htmlContent);

        const userId = this.currentUser()?.uid;
        if (!userId) {
          throw new Error('User not authenticated');
        }

        if (material.ownerId !== userId) {
          const canEditMaterial = await this.participantService.canEdit(id, userId);
          this.canEdit.set(canEditMaterial);
          if (!canEditMaterial) {
            this.error.set('Du hast keine Berechtigung, diese Unterlage zu bearbeiten');
            this.toastService.error('Du hast keine Berechtigung, diese Unterlage zu bearbeiten');
            this.isLoading.set(false);
            setTimeout(() => {
              this.router.navigate(['/lernen/material', id]);
            }, 2000);
            return material;
          }
        } else {
          this.canEdit.set(true);
        }

        this.materialForm.patchValue({
          title: material.title,
          description: material.description,
          tags: material.tags.join(', '),
          visibility: material.visibility
        }, { emitEvent: false });

        this.loadCoAuthors(id);

        return material;
      }),
      catchError(err => {
        console.error('Error loading material:', err);
        this.error.set(err.message || 'Failed to load material');
        return of(null);
      })
    ).subscribe({
      next: () => {
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading material data:', err);
        this.error.set('Failed to load material. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  // File upload handlers
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  private async handleFile(file: File): Promise<void> {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      this.error.set('Bitte wähle eine HTML-Datei (.html oder .htm)');
      return;
    }

    if (file.size > 250 * 1024) { // 250KB limit
      this.error.set('Die Datei ist zu groß. Maximale Größe: 250KB');
      return;
    }

    try {
      const content = await this.readFileAsText(file);
      this.htmlContent.set(content);
      this.updateEditorContent(content);
      this.fileName.set(file.name);
      this.updatePreview(content);
      this.unsavedChanges.set(true);

      // Auto-fill title from filename if empty
      if (!this.materialForm.get('title')?.value || this.materialForm.get('title')?.value === 'Neue Lernunterlage') {
        const titleFromFile = file.name.replace(/\.(html|htm)$/i, '').replace(/[-_]/g, ' ');
        this.materialForm.patchValue({ title: titleFromFile });
      }

      this.error.set(null);
    } catch (err) {
      console.error('Error reading file:', err);
      this.error.set('Fehler beim Lesen der Datei');
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private updatePreview(htmlContent: string): void {
    if (!htmlContent) {
      this.sanitizedPreview.set(null);
      return;
    }

    const sanitized = DOMPurify.sanitize(htmlContent, {
      WHOLE_DOCUMENT: true,
      ALLOW_DATA_ATTR: true,
      ADD_TAGS: ['style'],
      ADD_ATTR: ['target', 'onclick']
    });

    const themedContent = this.injectThemeSupport(sanitized);
    this.sanitizedPreview.set(this.sanitizer.bypassSecurityTrustHtml(themedContent));
  }

  private injectThemeSupport(html: string): string {
    const themeStyles = `
      <style>
        :root {
          --color-background: #f5f5f5;
          --color-surface: #ffffff;
          --color-text-primary: #1a1a1a;
          --color-text-secondary: #666666;
          --color-primary: #6366f1;
          --color-border: #e5e5e5;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --color-background: #0f0f0f;
            --color-surface: #1a1a1a;
            --color-text-primary: #ffffff;
            --color-text-secondary: #a0a0a0;
            --color-primary: #818cf8;
            --color-border: #333333;
          }
        }
        body {
          font-family: system-ui, -apple-system, sans-serif;
          background: var(--color-background);
          color: var(--color-text-primary);
          margin: 0;
          padding: 20px;
        }
      </style>
    `;

    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>${themeStyles}`);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', `<html><head>${themeStyles}</head>`);
    } else {
      return themeStyles + html;
    }
  }

  onHtmlContentChange(content: string): void {
    this.htmlContent.set(content);
    this.updatePreview(content);
    this.unsavedChanges.set(true);
  }

  togglePreview(): void {
    this.showPreview.update(v => !v);
  }

  async createMaterial(): Promise<void> {
    if (this.materialForm.invalid) {
      this.error.set('Bitte fülle alle erforderlichen Felder aus');
      return;
    }

    if (!this.htmlContent()) {
      this.error.set('Bitte lade eine HTML-Datei hoch oder gib HTML-Inhalt ein');
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      const userId = this.currentUser()?.uid;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const formValue = this.materialForm.value;
      const tagsArray = formValue.tags
        ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : [];

      const materialData: any = {
        title: formValue.title,
        description: formValue.description || '',
        ownerId: userId,
        visibility: formValue.visibility,
        htmlContent: this.htmlContent(),
        contentSize: new Blob([this.htmlContent()]).size,
        tags: tagsArray,
        metadata: { totalStudents: 0, totalViews: 0 }
      };

      if (formValue.visibility === 'unlisted') {
        materialData.joinCode = this.materialService.generateJoinCode();
      }

      this.materialService.createMaterial(materialData).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: async (materialId) => {
          this.materialId.set(materialId);

          // Add owner as participant
          const userEmail = this.currentUser()?.email || '';
          await this.participantService.addParticipant(
            materialId,
            userId,
            userEmail,
            'owner',
            undefined,
            'accepted'
          );

          try {
            await this.saveCoAuthors(materialId);
          } catch (err) {
            console.error('Failed to save co-authors for new material:', err);
          }

          this.successMessage.set('Lernunterlage erstellt!');
          this.isSaving.set(false);
          this.unsavedChanges.set(false);

          this.router.navigate(['/lernen/material-editor', materialId], {
            state: {
              materialId,
              coAuthorsDraft: this.coAuthors(),
              coAuthorErrors: this.coAuthorErrors()
            }
          });
        },
        error: (err) => {
          console.error('Error creating material:', err);
          this.error.set('Fehler beim Erstellen der Unterlage');
          this.isSaving.set(false);
        }
      });
    } catch (err: any) {
      console.error('Error creating material:', err);
      this.error.set(err.message || 'Fehler beim Erstellen');
      this.isSaving.set(false);
    }
  }

  async saveMaterial(): Promise<void> {
    if (this.isNewMaterial()) {
      await this.createMaterial();
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      const formValue = this.materialForm.value;
      const tagsArray = formValue.tags
        ? formValue.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        : [];

      const updates: Partial<LearningMaterial> = {
        title: formValue.title,
        description: formValue.description || '',
        tags: tagsArray,
        visibility: formValue.visibility,
        htmlContent: this.htmlContent()
      };

      if (formValue.visibility === 'unlisted' && !this.material()?.joinCode) {
        updates.joinCode = this.materialService.generateJoinCode();
      }

      await new Promise<void>((resolve, reject) => {
        this.materialService.updateMaterial(this.materialId()!, updates).pipe(
          takeUntilDestroyed(this.destroyRef)
        ).subscribe({
          next: () => resolve(),
          error: (err) => reject(err)
        });
      });

      try {
        await this.saveCoAuthors(this.materialId()!);
      } catch (err) {
        console.error('Failed to save co-authors:', err);
      }

      const hasCoAuthorErrors = this.coAuthorErrors().length > 0;
      this.unsavedChanges.set(hasCoAuthorErrors);
      this.successMessage.set(hasCoAuthorErrors ? 'Gespeichert (Mit-Autoren teilweise fehlgeschlagen)' : 'Alle Änderungen gespeichert');
      setTimeout(() => this.successMessage.set(null), 2000);
    } catch (err) {
      console.error('Error saving material:', err);
      this.error.set('Fehler beim Speichern');
    } finally {
      this.isSaving.set(false);
    }
  }

  onCoAuthorInput(raw: string): void {
    const emails = raw
      .split(/[\n,;]/)
      .map(e => e.trim().toLowerCase())
      .filter(e => !!e);
    const unique = Array.from(new Set(emails));

    this.coAuthors.set(unique);
    this.coAuthorErrors.set([]);
    this.unsavedChanges.set(true);
  }

  private loadCoAuthors(materialId: string): void {
    this.participantService.getParticipantsByMaterialId(materialId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (participants) => {
        const coAuthorEmails = participants
          .filter(p => p.role === 'co-author')
          .map(p => (p.email || '').trim().toLowerCase())
          .filter(e => !!e);
        this.coAuthors.set(Array.from(new Set(coAuthorEmails)));
        this.coAuthorErrors.set([]);
      },
      error: (err) => console.error('Error loading co-authors:', err)
    });
  }

  private async saveCoAuthors(materialId: string): Promise<void> {
    const userId = this.currentUser()?.uid;
    if (!userId || !materialId) return;

    if (!this.isOwner()) return;

    const emails = this.coAuthors();
    const errors: string[] = [];

    const existingParticipants = await firstValueFrom(
      this.participantService.getParticipantsByMaterialId(materialId)
    );
    const existingCoAuthors = existingParticipants.filter(p => p.role === 'co-author');
    const existingEmails = new Set(
      existingCoAuthors.map(p => (p.email || '').trim().toLowerCase()).filter(e => !!e)
    );
    const newEmailsSet = new Set(emails);

    // Remove co-authors no longer in list
    const toRemove = existingCoAuthors.filter(p => !newEmailsSet.has((p.email || '').trim().toLowerCase()));
    for (const participant of toRemove) {
      try {
        await this.participantService.removeParticipant(materialId, participant.userId);
      } catch (err) {
        console.error(`Failed to remove co-author ${participant.email}:`, err);
      }
    }

    // Add new co-authors
    const toAdd = emails.filter(email => !existingEmails.has(email));
    for (const email of toAdd) {
      if (email === this.currentUser()?.email?.toLowerCase()) {
        continue;
      }

      if (!this.isValidEmail(email)) {
        errors.push(`Ungültiges E-Mail-Format: ${email}`);
        continue;
      }

      try {
        const coAuthorUserId = await this.userLookupService.getUserIdByEmail(email);

        if (!coAuthorUserId) {
          errors.push(`Benutzer nicht gefunden: ${email} (muss sich erst registrieren)`);
          continue;
        }

        await this.participantService.addParticipant(
          materialId,
          coAuthorUserId,
          email,
          'co-author',
          userId,
          'accepted'
        );
      } catch (err: any) {
        console.error(`Failed to add co-author ${email}:`, err);
        errors.push(`Fehler bei ${email}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      this.coAuthorErrors.set(errors);
      this.toastService.warning('Einige Mit-Autoren konnten nicht hinzugefügt werden.');
    } else {
      this.coAuthorErrors.set([]);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async deleteMaterial(): Promise<void> {
    const materialId = this.materialId();
    if (!materialId) {
      this.error.set('Keine Unterlage zum Löschen');
      return;
    }

    const materialTitle = this.material()?.title || 'diese Unterlage';
    const confirmed = confirm(`Möchtest du "${materialTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`);

    if (!confirmed) {
      return;
    }

    this.isSaving.set(true);
    this.error.set(null);

    try {
      await this.materialService.deleteMaterialWithCleanup(
        materialId,
        this.participantService
      );

      this.router.navigate(['/lernen/materials']);
    } catch (err) {
      console.error('Error deleting material:', err);
      this.error.set('Fehler beim Löschen der Unterlage');
      this.isSaving.set(false);
    }
  }

  retry(): void {
    this.error.set(null);
    this.loadMaterialData();
  }

  goBack(): void {
    if (this.materialId()) {
      this.router.navigate(['/lernen/material', this.materialId()]);
    } else {
      this.router.navigate(['/lernen/materials']);
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
