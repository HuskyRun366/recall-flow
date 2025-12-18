import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface ProcessedFile {
  name: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

export interface FileValidationError {
  key: string;
  params?: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class FileProcessingService {

  processFiles(files: File[]): Observable<ProcessedFile[]> {
    return from(this.convertFilesToBase64(files));
  }

  private async convertFilesToBase64(files: File[]): Promise<ProcessedFile[]> {
    const processed: ProcessedFile[] = [];

    for (const file of files) {
      const data = await this.fileToBase64(file);
      processed.push({
        name: file.name,
        mimeType: file.type,
        data,
        size: file.size
      });
    }

    return processed;
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (data:image/png;base64,)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  validateFile(file: File, maxSizeMB: number): FileValidationError | null {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const validPdfTypes = ['application/pdf'];
    const validTypes = [...validImageTypes, ...validPdfTypes];

    if (!validTypes.includes(file.type)) {
      return {
        key: 'fileValidation.invalidType',
        params: {
          type: file.type || 'unknown',
          allowed: 'JPG, PNG, GIF, WebP, PDF'
        }
      };
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      return {
        key: 'fileValidation.tooLarge',
        params: {
          size: `${fileSizeMB.toFixed(1)}MB`,
          max: `${maxSizeMB}MB`
        }
      };
    }

    return null;
  }

  getTotalSize(files: File[]): number {
    return files.reduce((sum, file) => sum + file.size, 0);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
