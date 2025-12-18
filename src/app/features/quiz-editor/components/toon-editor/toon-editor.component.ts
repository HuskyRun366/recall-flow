import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { EditorView } from '@codemirror/view';
import { EditorState, StateEffect } from '@codemirror/state';
import { foldAll, unfoldAll } from '@codemirror/language';
import { CodeMirrorConfigService } from '../../../../shared/services/codemirror-config.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { Quiz, Question } from '../../../../models';
import { ToonStringifier } from '../../../../shared/utils/toon-stringifier';
import { ToonParser } from '../../../../shared/utils/toon-parser';

@Component({
  selector: 'app-toon-editor',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './toon-editor.component.html',
  styleUrls: ['./toon-editor.component.scss']
})
export class ToonEditorComponent implements OnInit, OnDestroy, AfterViewInit {
  private codeMirrorConfig = inject(CodeMirrorConfigService);
  private themeService = inject(ThemeService);

  @ViewChild('editorContainer', { static: false }) editorContainer!: ElementRef;

  @Input() quiz!: Partial<Quiz>;
  @Input() questions: Question[] = [];
  @Output() quizChange = new EventEmitter<Partial<Quiz>>();
  @Output() questionsChange = new EventEmitter<Question[]>();

  editorView?: EditorView;
  editorContent = signal('');
  parseError = signal<string | null>(null);

  private updateTimeout: any;

  constructor() {
    // Update editor theme when app theme changes
    effect(() => {
      const isDark = this.themeService.theme() === 'dark';
      this.updateEditorTheme(isDark);
    });
  }

  ngOnInit(): void {
    // Prepare initial content (editor will be initialized in ngAfterViewInit)
    if (this.quiz) {
      this.editorContent.set(ToonStringifier.stringify(this.quiz, this.questions));
    } else {
      this.editorContent.set(ToonStringifier.getExampleToon());
    }
  }

  ngAfterViewInit(): void {
    this.initializeEditor();
  }

  ngOnDestroy(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  private initializeEditor(): void {
    const isDark = this.themeService.theme() === 'dark';
    const initialContent = this.editorContent();

    this.editorView = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: this.codeMirrorConfig.getEditorExtensions(
          isDark,
          (content) => this.onContentChange(content)
        )
      }),
      parent: this.editorContainer.nativeElement
    });
  }

  private updateEditorTheme(isDark: boolean): void {
    if (!this.editorView) return;

    this.editorView.dispatch({
      effects: StateEffect.reconfigure.of(
        this.codeMirrorConfig.getEditorExtensions(
          isDark,
          (content) => this.onContentChange(content)
        )
      )
    });
  }

  onContentChange(content: string): void {
    this.editorContent.set(content);

    // Debounce parsing to avoid performance issues
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.parseAndEmit(content);
    }, 500);
  }

  private parseAndEmit(content: string): void {
    try {
      this.parseError.set(null);
      const parsed = ToonParser.parse(content);

      // Merge with existing quiz data (preserve id, ownerId, createdAt)
      const updatedQuiz: Partial<Quiz> = {
        ...this.quiz,
        ...parsed.quiz,
        id: this.quiz.id,
        ownerId: this.quiz.ownerId,
        createdAt: this.quiz.createdAt
      };

      this.quizChange.emit(updatedQuiz);
      this.questionsChange.emit(parsed.questions);
    } catch (err: any) {
      this.parseError.set(err.message);
    }
  }

  insertExample(): void {
    const exampleContent = ToonStringifier.getExampleToon();

    if (this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: exampleContent
        }
      });
    }

    this.editorContent.set(exampleContent);
    this.parseAndEmit(exampleContent);
  }

  formatDocument(): void {
    if (!this.editorView) return;
    try {
      const parsed = ToonParser.parse(this.editorView.state.doc.toString());
      const formatted = ToonStringifier.stringify(parsed.quiz, parsed.questions);
      this.editorView.dispatch({
        changes: { from: 0, to: this.editorView.state.doc.length, insert: formatted }
      });
      this.editorContent.set(formatted);
      this.parseAndEmit(formatted);
    } catch (err) {
      // Keep current content; lint already shows errors
    }
  }

  foldAll(): void {
    if (!this.editorView) return;
    foldAll(this.editorView);
  }

  unfoldAll(): void {
    if (!this.editorView) return;
    unfoldAll(this.editorView);
  }

  showAbout = signal(false);

openAbout(): void { this.showAbout.set(true); }
closeAbout(): void { this.showAbout.set(false); }

}
