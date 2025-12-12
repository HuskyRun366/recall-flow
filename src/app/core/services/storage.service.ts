import { Injectable } from '@angular/core';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from '@angular/fire/storage';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(private storage: Storage) {}

  uploadQuestionImage(
    file: File,
    quizId: string,
    questionId: string
  ): Observable<string> {
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;
    const filePath = `quiz-images/${quizId}/${questionId}/${fileName}`;
    const fileRef = ref(this.storage, filePath);

    return from(uploadBytes(fileRef, file)).pipe(
      switchMap(() => from(getDownloadURL(fileRef)))
    );
  }

  deleteQuestionImage(imageUrl: string): Observable<void> {
    try {
      // Extract the file path from the URL
      const fileRef = ref(this.storage, imageUrl);
      return from(deleteObject(fileRef));
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  deleteAllQuestionImages(quizId: string, questionId: string): Observable<void> {
    // Note: Firebase Storage doesn't have a direct way to delete all files in a folder
    // This would need to be handled by tracking image URLs and deleting them individually
    // For now, we'll just return a completed observable
    return new Observable(observer => {
      observer.next();
      observer.complete();
    });
  }
}
