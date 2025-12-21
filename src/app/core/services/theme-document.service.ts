import { Injectable, inject, runInInjectionContext, Injector } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment
} from '@angular/fire/firestore';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { MarketplaceTheme, ThemeVisibility } from '../../models';
import type { ThemePalette } from './color-theme.service';

@Injectable({
  providedIn: 'root'
})
export class ThemeDocumentService {
  private readonly THEME_COLLECTION = 'themes';
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  createTheme(input: {
    title: string;
    description: string;
    ownerId: string;
    visibility: ThemeVisibility;
    palette: ThemePalette;
    darkPalette?: Partial<ThemePalette>;
    originId?: string;
  }): Observable<string> {
    const themeRef = doc(collection(this.firestore, this.THEME_COLLECTION));
    const themeId = themeRef.id;

    const themeData = {
      ...input,
      id: themeId,
      metadata: {
        totalInstalls: 0
      },
      averageRating: 0,
      ratingCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    return from(setDoc(themeRef, themeData)).pipe(map(() => themeId));
  }

  updateTheme(themeId: string, updates: Partial<MarketplaceTheme>): Observable<void> {
    const themeRef = doc(this.firestore, `${this.THEME_COLLECTION}/${themeId}`);
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    delete (updateData as any).id;
    delete (updateData as any).createdAt;

    return from(updateDoc(themeRef, updateData));
  }

  async updateInstallCount(themeId: string, delta: number): Promise<void> {
    if (!themeId || !Number.isFinite(delta) || delta === 0) return;
    const themeRef = doc(this.firestore, `${this.THEME_COLLECTION}/${themeId}`);

    if (delta < 0) {
      try {
        const snap = await runInInjectionContext(this.injector, () => getDoc(themeRef));
        if (!snap.exists()) return;
        const raw = (snap.data() as any)?.metadata?.totalInstalls;
        const current = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
        if (current <= 0) return;
      } catch (error) {
        console.warn('Failed to read theme install count:', error);
        return;
      }
    }

    await updateDoc(themeRef, {
      'metadata.totalInstalls': increment(delta)
    });
  }

  deleteTheme(themeId: string): Observable<void> {
    const themeRef = doc(this.firestore, `${this.THEME_COLLECTION}/${themeId}`);
    return from(deleteDoc(themeRef));
  }

  getThemeById(themeId: string): Observable<MarketplaceTheme | null> {
    const themeRef = doc(this.firestore, `${this.THEME_COLLECTION}/${themeId}`);
    return from(runInInjectionContext(this.injector, () => getDoc(themeRef))).pipe(
      map((docSnap) => {
        if (!docSnap.exists()) return null;
        return this.convertTimestamps(docSnap.data() as any);
      })
    );
  }

  getThemesForUser(userId: string): Observable<MarketplaceTheme[]> {
    const themesRef = collection(this.firestore, this.THEME_COLLECTION);
    const q = query(themesRef, where('ownerId', '==', userId), orderBy('updatedAt', 'desc'));

    return from(runInInjectionContext(this.injector, () => getDocs(q))).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.convertTimestamps(d.data() as any)))
    );
  }

  getPublicThemes(limitCount: number = 50): Observable<MarketplaceTheme[]> {
    const themesRef = collection(this.firestore, this.THEME_COLLECTION);
    const q = query(themesRef, where('visibility', '==', 'public'), orderBy('updatedAt', 'desc'), limit(limitCount));

    return from(runInInjectionContext(this.injector, () => getDocs(q))).pipe(
      map((snapshot) => snapshot.docs.map((d) => this.convertTimestamps(d.data() as any)))
    );
  }

  private convertTimestamps(data: any): MarketplaceTheme {
    return {
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt
    };
  }
}
