export interface DeckParticipant {
  userId: string;
  email: string;
  role: 'owner' | 'co-author' | 'student';
  invitedBy?: string;
  invitedAt: Date;
  status: 'pending' | 'accepted';
}

export interface UserDeckReference {
  deckId: string;
  role: 'owner' | 'co-author' | 'student';
  addedAt: Date;
  lastAccessedAt: Date;
  // Organization fields
  folderId?: string;
  tags: string[];
  isFavorite: boolean;
}
