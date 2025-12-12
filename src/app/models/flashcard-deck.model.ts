export interface FlashcardDeck {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  visibility: 'public' | 'private' | 'unlisted';
  joinCode?: string; // For unlisted decks
  cardCount: number; // Denormalized for display
  tags: string[]; // For categorization/filtering
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalStudents: number; // Number of people studying this deck
    totalCompletions: number;
  };
}
