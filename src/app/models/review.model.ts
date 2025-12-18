export type ContentType = 'quiz' | 'deck' | 'material' | 'theme';

export interface Review {
  id: string;
  contentId: string;
  contentType: ContentType;
  userId: string;
  userDisplayName: string;
  userPhotoUrl?: string;
  rating: number; // 1-5 stars
  comment?: string; // Optional text review
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewSummary {
  averageRating: number;
  ratingCount: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
