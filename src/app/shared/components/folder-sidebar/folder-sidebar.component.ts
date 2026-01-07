import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Folder } from '../../../models';

@Component({
  selector: 'app-folder-sidebar',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './folder-sidebar.component.html',
  styleUrls: ['./folder-sidebar.component.scss']
})
export class FolderSidebarComponent {
  folders = input<Folder[]>([]);
  selectedFolderId = input<string | null>(null);
  showFavorites = input<boolean>(false);
  collapsed = input<boolean>(true);

  folderSelect = output<string | null>();
  favoritesToggle = output<boolean>();
  createFolder = output<void>();
  editFolder = output<Folder>();
  deleteFolder = output<Folder>();
  collapsedChange = output<boolean>();

  toggleCollapse(): void {
    this.collapsedChange.emit(!this.collapsed());
  }

  selectAll(): void {
    this.folderSelect.emit(null);
    this.favoritesToggle.emit(false);
  }

  selectFavorites(): void {
    this.folderSelect.emit(null);
    this.favoritesToggle.emit(true);
  }

  selectFolder(folderId: string): void {
    this.favoritesToggle.emit(false);
    this.folderSelect.emit(folderId);
  }

  onCreateFolder(): void {
    this.createFolder.emit();
  }

  onEditFolder(event: Event, folder: Folder): void {
    event.stopPropagation();
    this.editFolder.emit(folder);
  }

  onDeleteFolder(event: Event, folder: Folder): void {
    event.stopPropagation();
    this.deleteFolder.emit(folder);
  }
}
