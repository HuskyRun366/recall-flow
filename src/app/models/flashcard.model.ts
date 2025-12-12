export interface Flashcard {
  id: string;
  deckId: string; // Reference to parent deck
  orderIndex: number; // For ordering cards in deck
  front: string; // Question/front text
  back: string; // Answer/back text
  frontImageUrl?: string; // Optional image for front
  backImageUrl?: string; // Optional image for back
  createdAt: Date;
  updatedAt: Date;
}
