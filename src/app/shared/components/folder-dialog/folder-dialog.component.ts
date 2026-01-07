import { Component, input, output, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Folder, FolderContentType } from '../../../models';

export interface FolderDialogData {
  mode: 'create' | 'edit';
  contentType: FolderContentType;
  folder?: Folder;
}

export interface FolderDialogResult {
  name: string;
  color: string;
  icon?: string;
}

@Component({
  selector: 'app-folder-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './folder-dialog.component.html',
  styleUrls: ['./folder-dialog.component.scss']
})
export class FolderDialogComponent {
  isOpen = input<boolean>(false);
  data = input<FolderDialogData | null>(null);

  close = output<void>();
  save = output<FolderDialogResult>();
  delete = output<void>();

  folderName = signal('');
  selectedColor = signal('#6366f1');
  selectedIcon = signal<string | undefined>(undefined);

  readonly colors = [
    '#6366f1', // Indigo (default)
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#6b7280', // Gray
  ];

  readonly icons = ['📁', '📚', '📝', '⭐', '🎯', '💡', '🔬', '🎨', '🏆', '📊'];

  isEditMode = computed(() => this.data()?.mode === 'edit');

  title = computed(() =>
    this.isEditMode() ? 'folders.editFolder' : 'folders.newFolder'
  );

  isValid = computed(() => this.folderName().trim().length > 0);

  constructor() {
    // Initialize form whenever isOpen becomes true
    effect(() => {
      if (this.isOpen()) {
        this.initializeForm();
      }
    });
  }

  private initializeForm(): void {
    const currentData = this.data();
    if (currentData?.folder) {
      this.folderName.set(currentData.folder.name);
      this.selectedColor.set(currentData.folder.color);
      this.selectedIcon.set(currentData.folder.icon);
    } else {
      this.folderName.set('');
      this.selectedColor.set('#6366f1');
      this.selectedIcon.set(undefined);
    }
  }

  selectColor(color: string): void {
    this.selectedColor.set(color);
  }

  selectIcon(icon: string): void {
    if (this.selectedIcon() === icon) {
      this.selectedIcon.set(undefined);
    } else {
      this.selectedIcon.set(icon);
    }
  }

  onSave(): void {
    if (!this.isValid()) return;

    this.save.emit({
      name: this.folderName().trim(),
      color: this.selectedColor(),
      icon: this.selectedIcon()
    });
  }

  onDelete(): void {
    this.delete.emit();
  }

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }
}
