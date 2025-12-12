export type ParticipantRole = 'owner' | 'co-author' | 'participant';
export type InvitationStatus = 'pending' | 'accepted';

export interface QuizParticipant {
  userId: string;
  email: string;
  role: ParticipantRole;
  invitedBy?: string; // userId of inviter (undefined for owner)
  invitedAt: Date;
  status: InvitationStatus;
}

export interface UserQuizReference {
  quizId: string;
  role: ParticipantRole;
  addedAt: Date;
  lastAccessedAt: Date;
}
