export interface UserEmailLookup {
  userId: string;
  email: string;
}

/**
 * Sanitize email for use as Firestore document ID
 * Converts: user@example.com → user-at-example-dot-com
 */
export function sanitizeEmailForDocId(email: string): string {
  return email
    .toLowerCase()
    .replace('@', '-at-')
    .replace(/\./g, '-dot-');
}

/**
 * Reverse sanitization to get original email format
 * Converts: user-at-example-dot-com → user@example.com
 */
export function desanitizeEmailFromDocId(docId: string): string {
  return docId
    .replace(/-at-/, '@')
    .replace(/-dot-/g, '.');
}
