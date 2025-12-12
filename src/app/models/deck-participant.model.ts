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
}
