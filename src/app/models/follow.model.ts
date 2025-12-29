/**
 * Represents a follow relationship stored in:
 * - users/{userId}/following/{followedUserId}
 * - users/{userId}/followers/{followerId}
 */
export interface FollowRelation {
  odisplayName: string;
  photoURL?: string;
  followedAt: Date;
}

/**
 * Data stored in users/{userId}/following/{followedUserId}
 */
export interface FollowingEntry {
  followedUserId: string;
  followedDisplayName: string;
  followedPhotoURL?: string;
  followedAt: Date;
}

/**
 * Data stored in users/{userId}/followers/{followerId}
 */
export interface FollowerEntry {
  followerId: string;
  followerDisplayName: string;
  followerPhotoURL?: string;
  followedAt: Date;
}

/**
 * Content types that can trigger follow notifications
 */
export type FollowNotificationContentType = 'quiz' | 'flashcardDeck' | 'learningMaterial';

/**
 * Notification types for follow system
 */
export type FollowNotificationType = 'new-quiz' | 'new-flashcard-deck' | 'new-material';

/**
 * Notification when a followed author publishes new content
 * Stored in: followNotifications/{notificationId}
 */
export interface FollowNotification {
  id: string;
  userId: string; // Recipient
  authorId: string;
  authorDisplayName: string;
  authorPhotoURL?: string;

  // Generic content fields (new)
  contentType: FollowNotificationContentType;
  contentId: string;
  contentTitle: string;

  // Legacy fields (kept for backwards compatibility)
  quizId?: string;
  quizTitle?: string;

  type: FollowNotificationType;
  createdAt: Date;
  read: boolean;
  pushSent?: boolean;        // Set by notification server after push is sent
  pushSentAt?: Date;         // Timestamp when push was sent
}
