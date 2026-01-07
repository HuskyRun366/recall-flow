export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'user';
  createdAt: Date;
  followerCount?: number;
  followingCount?: number;
  language?: 'de' | 'en' | 'fr' | 'es';
  lastLoginAt?: Date;
}
