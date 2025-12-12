import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImportService, ImportResult, ImportedQuestion } from '../../../../core/services/import.service';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-dialog.component.html',
  styleUrls: ['./import-dialog.component.scss']
})
export class ImportDialogComponent {
  @Output() importComplete = new EventEmitter<ImportedQuestion[]>();
  @Output() close = new EventEmitter<void>();

  isDragging = signal(false);
  isProcessing = signal(false);
  importResult = signal<ImportResult | null>(null);

  constructor(private importService: ImportService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.processFile(event.dataTransfer.files[0]);
    }
  }

  async processFile(file: File): Promise<void> {
    this.isProcessing.set(true);
    this.importResult.set(null);

    try {
      const result = await this.importService.importFromFile(file);
      this.importResult.set(result);
    } catch (error) {
      console.error('Import error:', error);
      this.importResult.set({
        questions: [],
        format: 'unknown',
        errors: ['Fehler beim Lesen der Datei']
      });
    } finally {
      this.isProcessing.set(false);
    }
  }

  confirmImport(): void {
    const result = this.importResult();
    if (result && result.questions.length > 0) {
      this.importComplete.emit(result.questions);
    }
  }

  cancel(): void {
    this.close.emit();
  }

  downloadSampleCsv(): void {
    const sample = `"Was ist 2+2?","4","3","5","6"
"Hauptstadt von Deutschland?","Berlin","München","Hamburg","Frankfurt"
"TypeScript ist?","Eine Programmiersprache","Ein Framework","Eine Datenbank","Ein Browser"`;

    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-quiz.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadSampleAnki(): void {
    const sample = `Was ist 2+2?\t4
Hauptstadt von Deutschland?\tBerlin
TypeScript ist?\tEine Programmiersprache`;

    const blob = new Blob([sample], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-anki.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}
