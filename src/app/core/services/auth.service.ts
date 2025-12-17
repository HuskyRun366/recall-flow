import { Injectable, signal, computed, inject, Injector, runInInjectionContext, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, user, User as FirebaseUser, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { User } from '../../models';
import { UserLookupService } from './user-lookup.service';
import { Observable, from, of, switchMap, timeout, catchError } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authUser$!: Observable<FirebaseUser | null>;
  private userLookupService = inject(UserLookupService);
  private injector = inject(Injector);

  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => this.currentUser() !== null);
  isAdmin = computed(() => this.currentUser()?.role === 'admin');

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router
  ) {
    // Initialize auth user observable
    this.authUser$ = user(this.auth);

    // DestroyRef for cleanup
    const destroyRef = inject(DestroyRef);

    // Subscribe to auth state changes with timeout protection
    this.authUser$.pipe(
      takeUntilDestroyed(destroyRef),
      switchMap(firebaseUser => {
        if (firebaseUser) {
          return from(this.loadUserDataFromFirebaseUser(firebaseUser)).pipe(
            timeout(5000),
            catchError(error => {
              console.error('Error loading user data:', error);
              this.currentUser.set(null);
              return of(null);
            })
          );
        } else {
          this.currentUser.set(null);
          return of(null);
        }
      })
    ).subscribe();
  }

  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);

      if (result.user) {
        await this.ensureUserDocument(result.user);
        await this.router.navigate(['/quiz', 'home']);
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.currentUser.set(null);
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  async ensureAuthenticated(): Promise<boolean> {
    // If already set, succeed fast
    if (this.currentUser()) return true;

    // Wait for first auth state emission
    const fbUser = await this.waitForAuthState();
    if (fbUser) {
      if (!this.currentUser()) {
        await this.loadUserDataFromFirebaseUser(fbUser);
      }
      return true;
    }
    return false;
  }

  private async loadUserDataFromFirebaseUser(firebaseUser: FirebaseUser): Promise<void> {
    try {
      const userDocRef = doc(this.firestore, `users/${firebaseUser.uid}`);
      const userDoc = await runInInjectionContext(this.injector, () => getDoc(userDocRef));

      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        this.currentUser.set({
          ...userData,
          createdAt: (userData.createdAt as any).toDate()
        });
      } else {
        // Create user document if it doesn't exist
        await this.ensureUserDocument(firebaseUser);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  private async ensureUserDocument(firebaseUser: FirebaseUser): Promise<void> {
    const userDocRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    const userDoc = await runInInjectionContext(this.injector, () => getDoc(userDocRef));

    if (!userDoc.exists()) {
      const newUser: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'Anonymous',
        photoURL: firebaseUser.photoURL || undefined,
        role: 'user', // Default role
        createdAt: new Date()
      };

      await setDoc(userDocRef, {
        ...newUser,
        createdAt: serverTimestamp()
      });

      // Create email lookup for this user (don't fail login if this fails)
      if (newUser.email) {
        try {
          await this.userLookupService.createEmailLookup(newUser.uid, newUser.email);
        } catch (error) {
          // Log error but don't block login - email lookup might be managed by backend
          console.warn('Could not create email lookup (this is okay if managed by backend):', error);
        }
      }

      this.currentUser.set(newUser);
    } else {
      const userData = userDoc.data() as User;
      this.currentUser.set({
        ...userData,
        createdAt: (userData.createdAt as any).toDate()
      });

      // Ensure email lookup exists for existing users (backfill)
      if (firebaseUser.email) {
        this.ensureEmailLookupExists(firebaseUser.uid, firebaseUser.email);
      }
    }
  }

  /**
   * Ensures email lookup exists for a user (async, non-blocking)
   * Creates it if missing - used for backfilling existing users
   */
  private ensureEmailLookupExists(userId: string, email: string): void {
    // Run async without blocking login
    (async () => {
      try {
        const existingUserId = await this.userLookupService.getUserIdByEmail(email);
        if (!existingUserId) {
          await this.userLookupService.createEmailLookup(userId, email);
          console.log('Email lookup created for existing user');
        }
      } catch (error) {
        console.warn('Could not ensure email lookup for existing user:', error);
      }
    })();
  }

  getUserById(uid: string): Observable<User | null> {
    return from(
      runInInjectionContext(this.injector, () => getDoc(doc(this.firestore, `users/${uid}`)))
    ).pipe(
      map(userDoc => {
        if (userDoc.exists()) {
          const data = userDoc.data() as User;
          return {
            ...data,
            createdAt: (data.createdAt as any).toDate()
          };
        }
        return null;
      })
    );
  }

  private waitForAuthState(): Promise<FirebaseUser | null> {
    return new Promise(resolve => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        resolve(user);
        unsubscribe();
      });
    });
  }
}
