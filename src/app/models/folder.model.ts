export type FolderContentType = 'quiz' | 'deck' | 'material';

export interface Folder {
  id: string;
  userId: string;
  name: string;
  color: string;           // Hex color e.g. '#6366f1'
  icon?: string;           // Optional: Emoji or icon name
  parentId?: string;       // For nested folders (future feature)
  contentType: FolderContentType;
  order: number;           // Sort order
  createdAt: Date;
  updatedAt: Date;
}
