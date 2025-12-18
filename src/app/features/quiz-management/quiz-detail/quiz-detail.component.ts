import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FirestoreService } from '../../../core/services/firestore.service';
import { QuestionService } from '../../../core/services/question.service';
import { ParticipantService } from '../../../core/services/participant.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Quiz, Question } from '../../../models';
import { StatCardComponent } from '../../../shared/components';

type EnrollState = 'idle' | 'loading' | 'removing';

@Component({
  selector: 'app-quiz-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, StatCardComponent],
  templateUrl: './quiz-detail.component.html',
  styleUrls: ['./quiz-detail.component.scss']
})
export class QuizDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestoreService = inject(FirestoreService);
  private questionService = inject(QuestionService);
  private participantService = inject(ParticipantService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  quiz = signal<Quiz | null>(null);
  questions = signal<Question[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);

  currentUser = this.authService.currentUser;
  isEnrolled = signal(false);
  enrollState = signal<EnrollState>('idle');
  canEdit = signal(false);
  copySuccess = signal(false);
  exportSuccess = signal(false);

  requiresEnrollment = computed(() => {
    const q = this.quiz();
    const uid = this.currentUser()?.uid;
    if (!q || !uid) return false;
    if (q.ownerId === uid) return false;
    return q.visibility === 'public';
  });

  canPlay = computed(() => {
    if (this.quiz()?.visibility !== 'public') return true;
    if (this.canEdit()) return true;
    return this.isEnrolled();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Ungültige Quiz-ID');
      this.isLoading.set(false);
      return;
    }

    this.firestoreService.getQuizById(id).subscribe({
      next: (q) => {
        if (!q) {
          this.error.set('Quiz nicht gefunden');
          this.isLoading.set(false);
          return;
        }
        this.quiz.set(q);
        this.loadQuestions(id);
        this.loadEnrollment(id);

        // Check edit permission
        const userId = this.currentUser()?.uid;
        if (userId) {
          this.checkCanEdit(q, userId);
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

  private loadQuestions(quizId: string): void {
    this.questionService.getQuestionsByQuizId(quizId).subscribe({
      next: (qs: Question[]) => this.questions.set(qs),
      error: (err: unknown) => console.error('Fragen laden fehlgeschlagen', err)
    });
  }

  private loadEnrollment(quizId: string): void {
    const uid = this.currentUser()?.uid;
    if (!uid) return;
    this.participantService.getParticipant(quizId, uid).subscribe({
      next: (p) => this.isEnrolled.set(!!p && p.role === 'participant' || p?.role === 'co-author'),
      error: (err) => console.error('Enrollment laden fehlgeschlagen', err)
    });
  }

  private async checkCanEdit(quiz: Quiz, userId: string): Promise<void> {
    if (quiz.ownerId === userId) {
      this.canEdit.set(true);
      return;
    }

    // Check if user is co-author
    const isCoAuthor = await this.participantService.canEdit(quiz.id, userId);
    this.canEdit.set(isCoAuthor);
  }

  async enroll(): Promise<void> {
    const q = this.quiz();
    const user = this.currentUser();
    if (!q || !user || this.enrollState() !== 'idle') return;

    this.enrollState.set('loading');
    try {
      await this.participantService.addParticipant(
        q.id,
        user.uid,
        user.email || '',
        'participant',
        user.uid,
        'accepted'
      );
      this.isEnrolled.set(true);
      this.toastService.success('Quiz hinzugefügt');
    } catch (err) {
      console.error('Enroll failed', err);
      this.toastService.error('Hinzufügen fehlgeschlagen');
    } finally {
      this.enrollState.set('idle');
    }
  }

  async unenroll(): Promise<void> {
    const q = this.quiz();
    const user = this.currentUser();
    if (!q || !user || this.enrollState() !== 'idle') return;

    this.enrollState.set('removing');
    try {
      await this.participantService.removeParticipant(q.id, user.uid);
      this.isEnrolled.set(false);
      this.toastService.success('Quiz entfernt');
    } catch (err) {
      console.error('Unenroll failed', err);
      this.toastService.error('Entfernen fehlgeschlagen');
    } finally {
      this.enrollState.set('idle');
    }
  }

  startQuiz(): void {
    const q = this.quiz();
    if (q) this.router.navigate(['/quiz', q.id, 'take']);
  }

  editQuiz(): void {
    const q = this.quiz();
    if (q) this.router.navigate(['/quiz', 'editor', q.id]);
  }

  copyJoinCode(): void {
    const code = this.quiz()?.joinCode;
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

  private formatQuizForExport(quiz: Quiz, questions: Question[]): string {
    const lines: string[] = [];

    // Header
    lines.push('='.repeat(80));
    lines.push(`QUIZ: ${quiz.title}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Metadata
    if (quiz.description) {
      lines.push(`Beschreibung: ${quiz.description}`);
    }
    lines.push(`Sichtbarkeit: ${quiz.visibility}`);
    lines.push(`Anzahl Fragen: ${questions.length}`);
    lines.push('');
    lines.push('='.repeat(80));

    // Questions
    questions.forEach((question, index) => {
      lines.push('');
      lines.push(`Frage ${index + 1}: ${question.questionText}`);

      // Question type label
      const typeLabels: Record<string, string> = {
        'multiple-choice': 'Multiple-Choice',
        'ordering': 'Reihenfolge',
        'matching': 'Zuordnung'
      };
      lines.push(`Typ: ${typeLabels[question.type] || question.type}`);
      lines.push('');

      // Format based on question type
      if (question.type === 'multiple-choice' && question.options) {
        question.options.forEach(option => {
          const marker = option.isCorrect ? '✓' : '✗';
          const label = option.isCorrect ? ' (korrekt)' : '';
          lines.push(`  ${marker} ${option.text}${label}`);
        });
      } else if (question.type === 'ordering' && question.orderItems) {
        // Sort by correctOrder
        const sorted = [...question.orderItems].sort((a, b) => a.correctOrder - b.correctOrder);
        sorted.forEach((item, i) => {
          lines.push(`  ${i + 1}. ${item.text}`);
        });
      } else if (question.type === 'matching' && question.matchingPairs && question.matchingChoices) {
        question.matchingPairs.forEach(pair => {
          const choice = question.matchingChoices?.find(c => c.id === pair.correctChoiceId);
          if (choice) {
            lines.push(`  ${pair.leftText} → ${choice.text}`);
          }
        });
      }

      // Separator between questions
      if (index < questions.length - 1) {
        lines.push('');
        lines.push('-'.repeat(80));
      }
    });

    // Footer
    lines.push('');
    lines.push('='.repeat(80));

    return lines.join('\n');
  }

  exportQuiz(): void {
    const q = this.quiz();
    const qs = this.questions();
    if (!q || !qs) return;

    // Menschenlesbaren Export generieren
    const exportContent = this.formatQuizForExport(q, qs);

    // Blob erstellen
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });

    // Download-Link erstellen
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Dateiname: quiz-title.txt (Sonderzeichen entfernen)
    const safeTitle = q.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '-');
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
}
