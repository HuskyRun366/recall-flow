import admin from 'firebase-admin';

// ============================================
// RecallFlow Quiz Notification Server
// Free deployment on Render.com
// ============================================
// Features:
// - Push notifications for quiz/content changes
// - Follow notifications for new content
// - Trending content calculation
// - Personalized recommendations
// - Orphan document cleanup
// - Storage quota monitoring
// ============================================

console.log('🚀 Starting RecallFlow Notification Server...');

// Validate required environment variables
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT environment variable is required');
  console.error('   Set it to the JSON content of your Firebase service account key');
  process.exit(1);
}

// Initialize Firebase Admin with service account
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('❌ Invalid FIREBASE_SERVICE_ACCOUNT JSON:', error.message);
  process.exit(1);
}

// Validate service account has required fields
const requiredFields = ['project_id', 'private_key', 'client_email'];
for (const field of requiredFields) {
  if (!serviceAccount[field]) {
    console.error(`❌ Service account missing required field: ${field}`);
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log('✅ Firebase Admin initialized');
console.log(`📊 Project: ${serviceAccount.project_id}`);

// Track last known state of each quiz to detect real changes
const quizLastUpdated = new Map();
const quizLastData = new Map();

// Track processed follow notifications to avoid duplicates
const processedFollowNotifications = new Set();

// Rate limiting: Track notifications per user (max 10 per minute)
const userNotificationRates = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 10;

/**
 * Check if user is rate limited
 */
function isRateLimited(userId) {
  const now = Date.now();
  const userRate = userNotificationRates.get(userId);

  if (!userRate) {
    userNotificationRates.set(userId, { count: 1, windowStart: now });
    return false;
  }

  // Reset window if expired
  if (now - userRate.windowStart > RATE_LIMIT_WINDOW) {
    userNotificationRates.set(userId, { count: 1, windowStart: now });
    return false;
  }

  // Check limit
  if (userRate.count >= RATE_LIMIT_MAX) {
    console.log(`  ⚠️  User ${userId.substring(0, 8)}... rate limited`);
    return true;
  }

  userRate.count++;
  return false;
}

/**
 * Sanitize string input to prevent injection
 */
function sanitizeString(input, maxLength = 200) {
  if (typeof input !== 'string') return '';
  return input
    .substring(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML/script tags
    .trim();
}

/**
 * Validate Firebase document ID format
 */
function isValidDocId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 128) return false;
  // Firebase doc IDs cannot contain: /, ., __, or start/end with whitespace
  return !/[\/\.]|^__|__$|^\s|\s$/.test(id);
}

/**
 * Get all user FCM tokens
 */
async function getUserTokens(userId) {
  // Validate userId
  if (!isValidDocId(userId)) {
    console.error(`Invalid userId format: ${userId}`);
    return [];
  }

  try {
    const tokensSnapshot = await db.collection(`users/${userId}/fcmTokens`).get();
    const tokens = [];

    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token && typeof data.token === 'string') {
        tokens.push(data.token);
      }
    });

    return tokens;
  } catch (error) {
    console.error(`Error getting tokens for user ${userId}:`, error);
    return [];
  }
}

/**
 * Get the URL for a content type
 */
function getContentUrl(contentType, contentId) {
  const baseUrl = 'https://recall-flow-app.web.app';
  switch (contentType) {
    case 'flashcardDeck':
      return `${baseUrl}/flashcards/${contentId}`;
    case 'learningMaterial':
      return `${baseUrl}/materials/${contentId}`;
    case 'quiz':
    default:
      return `${baseUrl}/quizzes/${contentId}`;
  }
}

/**
 * Send push notification to users
 */
async function sendNotification(tokens, title, body, contentId, type, contentType = 'quiz') {
  if (tokens.length === 0) {
    console.log('  ⚠️  No tokens to send to');
    return;
  }

  const contentUrl = getContentUrl(contentType, contentId);

  const payload = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      contentId,
      contentType,
      type,
      action: `view-${contentType}`,
      timestamp: Date.now().toString(),
      // Legacy field for backwards compatibility
      quizId: contentType === 'quiz' ? contentId : ''
    },
    webpush: {
      notification: {
        icon: '/assets/icons/icon-192x192.png',
      },
      fcmOptions: {
        link: contentUrl,
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(payload);
    console.log(`  ✅ Sent ${response.successCount}/${tokens.length} notifications`);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokens[idx]);
          }
        }
      });

      if (failedTokens.length > 0) {
        console.log(`  🧹 Cleaning up ${failedTokens.length} invalid tokens...`);
        // Note: Token cleanup would require knowing which user they belong to
        // In production, you'd want to store user-token mapping
      }
    }
  } catch (error) {
    console.error('  ❌ Error sending notifications:', error);
  }
}

/**
 * Get co-authors and owner for a quiz
 */
async function getNotifiableUsers(quizId, excludeUserId = null) {
  try {
    const participantsSnapshot = await db
      .collection(`quizParticipants/${quizId}/participants`)
      .get();

    const notifiableUsers = [];

    participantsSnapshot.forEach(doc => {
      const data = doc.data();
      const userId = doc.id;
      const role = data.role;

      // Only notify owners and co-authors (not regular participants)
      // Exclude the user who made the change
      if (
        (role === 'owner' || role === 'co-author') &&
        userId !== excludeUserId
      ) {
        notifiableUsers.push(userId);
      }
    });

    return notifiableUsers;
  } catch (error) {
    console.error(`Error getting participants for quiz ${quizId}:`, error);
    return [];
  }
}

/**
 * Handle quiz update
 */
async function handleQuizUpdate(quizId, beforeData, afterData) {
  const title = afterData.title || 'Unbenanntes Quiz';

  // Determine what changed
  let changeDescription = 'wurde aktualisiert';
  if (beforeData && beforeData.title !== afterData.title) {
    changeDescription = 'Titel wurde geändert';
  } else if (beforeData && beforeData.description !== afterData.description) {
    changeDescription = 'Beschreibung wurde geändert';
  } else if (beforeData && beforeData.questionCount !== afterData.questionCount) {
    changeDescription = 'Fragen wurden hinzugefügt/entfernt';
  }

  console.log(`📝 Quiz updated: "${title}" - ${changeDescription}`);

  // Get users to notify
  const userIds = await getNotifiableUsers(quizId);

  if (userIds.length === 0) {
    console.log('  ℹ️  No users to notify');
    return;
  }

  console.log(`  👥 Notifying ${userIds.length} users...`);

  // Get all tokens
  const allTokens = [];
  for (const userId of userIds) {
    const tokens = await getUserTokens(userId);
    allTokens.push(...tokens);
  }

  // Send notification
  await sendNotification(
    allTokens,
    `Quiz aktualisiert: ${title}`,
    `Das Quiz "${title}" ${changeDescription}`,
    quizId,
    'quiz-updated'
  );
}

/**
 * Handle question count change
 */
async function handleQuestionCountChange(quizId, quizTitle, oldCount, newCount) {
  const diff = newCount - oldCount;

  if (diff === 0) return;

  const type = diff > 0 ? 'question-added' : 'question-deleted';
  const action = diff > 0 ? 'hinzugefügt' : 'entfernt';
  const absDiff = Math.abs(diff);

  console.log(`${diff > 0 ? '➕' : '➖'} ${absDiff} Frage${absDiff > 1 ? 'n' : ''} ${action}: "${quizTitle}"`);

  // Get users to notify
  const userIds = await getNotifiableUsers(quizId);

  if (userIds.length === 0) {
    console.log('  ℹ️  No users to notify');
    return;
  }

  console.log(`  👥 Notifying ${userIds.length} users...`);

  // Get all tokens
  const allTokens = [];
  for (const userId of userIds) {
    const tokens = await getUserTokens(userId);
    allTokens.push(...tokens);
  }

  // Send notification
  await sendNotification(
    allTokens,
    diff > 0 ? `Neue Frage: ${quizTitle}` : `Frage gelöscht: ${quizTitle}`,
    `${absDiff} Frage${absDiff > 1 ? 'n' : ''} ${action} in "${quizTitle}"`,
    quizId,
    type
  );
}

/**
 * Start listening to quiz changes
 */
function startQuizListener() {
  console.log('👂 Starting quiz change listener...');

  db.collection('quizzes').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      const quizId = change.doc.id;
      const data = change.doc.data();
      const currentUpdate = data.updatedAt?.toDate() || new Date();
      const lastUpdate = quizLastUpdated.get(quizId);
      const previousData = quizLastData.get(quizId);

      if (change.type === 'added') {
        quizLastUpdated.set(quizId, currentUpdate);
        quizLastData.set(quizId, data);
        return;
      }

      if (change.type === 'modified') {
        // Skip if this is initial load or not a real update
        if (!lastUpdate || currentUpdate <= lastUpdate) {
          quizLastUpdated.set(quizId, currentUpdate);
          quizLastData.set(quizId, data);
          return;
        }

        const questionCountChanged = previousData && previousData.questionCount !== data.questionCount;
        const titleChanged = previousData && previousData.title !== data.title;
        const descriptionChanged = previousData && previousData.description !== data.description;

        // If only question count changed, send a single question-change notification.
        // Otherwise, send a single general update notification.
        if (questionCountChanged && !titleChanged && !descriptionChanged) {
          await handleQuestionCountChange(
            quizId,
            data.title || 'Quiz',
            previousData?.questionCount || 0,
            data.questionCount || 0
          );
        } else {
          await handleQuizUpdate(quizId, previousData || null, data);
        }

        quizLastUpdated.set(quizId, currentUpdate);
        quizLastData.set(quizId, data);
      }
    });
  }, error => {
    console.error('❌ Quiz listener error:', error);
  });

  console.log('✅ Quiz listener active');
}

/**
 * Get notification title and body based on content type and whether it's an update
 */
function getNotificationText(contentType, authorName, contentTitle, isUpdate = false) {
  if (isUpdate) {
    switch (contentType) {
      case 'flashcardDeck':
        return {
          title: `Flashcard-Deck aktualisiert von ${authorName}`,
          body: `"${contentTitle}" wurde aktualisiert`,
          emoji: '🃏'
        };
      case 'learningMaterial':
        return {
          title: `Lernmaterial aktualisiert von ${authorName}`,
          body: `"${contentTitle}" wurde aktualisiert`,
          emoji: '📚'
        };
      case 'quiz':
      default:
        return {
          title: `Quiz aktualisiert von ${authorName}`,
          body: `"${contentTitle}" wurde aktualisiert`,
          emoji: '📝'
        };
    }
  }

  // New content
  switch (contentType) {
    case 'flashcardDeck':
      return {
        title: `Neues Flashcard-Deck von ${authorName}`,
        body: `"${contentTitle}" wurde gerade veröffentlicht`,
        emoji: '🃏'
      };
    case 'learningMaterial':
      return {
        title: `Neues Lernmaterial von ${authorName}`,
        body: `"${contentTitle}" wurde gerade veröffentlicht`,
        emoji: '📚'
      };
    case 'quiz':
    default:
      return {
        title: `Neues Quiz von ${authorName}`,
        body: `"${contentTitle}" wurde gerade veröffentlicht`,
        emoji: '📝'
      };
  }
}

/**
 * Handle follow notification (new or updated content from followed author)
 */
async function handleFollowNotification(notificationId, data) {
  // Get content info - support both new generic fields and legacy quiz-only fields
  const contentType = data.contentType || 'quiz';
  const contentId = data.contentId || data.quizId;
  const contentTitle = data.contentTitle || data.quizTitle;

  // Determine if this is an update notification
  const isUpdate = data.type && data.type.startsWith('updated-');

  // Validate required fields
  if (!data.userId || !contentId || !data.authorDisplayName || !contentTitle) {
    console.log(`  ⚠️  Follow notification ${notificationId} missing required fields`);
    return;
  }

  // Validate IDs
  if (!isValidDocId(data.userId) || !isValidDocId(contentId)) {
    console.log(`  ⚠️  Follow notification ${notificationId} has invalid IDs`);
    return;
  }

  // Skip if already processed (deduplication)
  if (processedFollowNotifications.has(notificationId)) {
    return;
  }
  processedFollowNotifications.add(notificationId);

  // Clean up old processed notifications (keep last 1000)
  if (processedFollowNotifications.size > 1000) {
    const iterator = processedFollowNotifications.values();
    for (let i = 0; i < 100; i++) {
      processedFollowNotifications.delete(iterator.next().value);
    }
  }

  // Rate limit check
  if (isRateLimited(data.userId)) {
    return;
  }

  // Sanitize strings
  const authorName = sanitizeString(data.authorDisplayName, 50);
  const sanitizedTitle = sanitizeString(contentTitle, 100);

  // Get content-specific notification text
  const notificationText = getNotificationText(contentType, authorName, sanitizedTitle, isUpdate);
  const action = isUpdate ? 'updated' : 'published';

  console.log(`${notificationText.emoji} Follow notification: "${authorName}" ${action} "${sanitizedTitle}" (${contentType})`);
  console.log(`   Target user: ${data.userId.substring(0, 8)}...`);

  // Get user's tokens
  const tokens = await getUserTokens(data.userId);

  if (tokens.length === 0) {
    console.log('  ℹ️  No tokens for this user');
    return;
  }

  // Send notification with content type for proper URL routing
  const notificationType = isUpdate ? `updated-${contentType}-from-following` : `new-${contentType}-from-following`;
  await sendNotification(
    tokens,
    notificationText.title,
    notificationText.body,
    contentId,
    notificationType,
    contentType
  );

  // Mark notification as sent in Firestore
  try {
    await db.doc(`followNotifications/${notificationId}`).update({
      pushSent: true,
      pushSentAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error(`  ⚠️  Could not mark notification as sent:`, error.message);
  }
}

/**
 * Start listening to follow notifications
 */
function startFollowNotificationListener() {
  console.log('👂 Starting follow notification listener...');

  // Valid notification types to process (new and update)
  const validTypes = [
    'new-quiz', 'new-flashcard-deck', 'new-material',
    'updated-quiz', 'updated-flashcard-deck', 'updated-material'
  ];

  // Single listener for all unread notifications
  // Handles both new notifications (pushSent: false) and legacy ones (pushSent: undefined)
  db.collection('followNotifications')
    .where('read', '==', false)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const notificationId = change.doc.id;
          const data = change.doc.data();

          // Only process if:
          // 1. Valid notification type
          // 2. Push hasn't been sent yet (pushSent is false or undefined)
          if (validTypes.includes(data.type) && data.pushSent !== true) {
            await handleFollowNotification(notificationId, data);
          }
        }
      });
    }, error => {
      console.error('❌ Follow notification listener error:', error);
    });

  console.log('✅ Follow notification listener active');
}

// ============================================
// TRENDING CONTENT CALCULATION
// ============================================

/**
 * Calculate trending score based on recent activity
 * Score = (completions * 3 + participants * 2 + views) * recencyMultiplier
 */
function calculateTrendingScore(quiz) {
  const completions = quiz.metadata?.totalCompletions || 0;
  const participants = quiz.metadata?.totalParticipants || 0;
  const views = quiz.viewCount || 0;

  // Recency bonus: newer quizzes get a boost
  const createdAt = quiz.createdAt?.toDate?.() || new Date(quiz.createdAt);
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyMultiplier = Math.max(0.5, 1 - (ageInDays / 30)); // 30-day decay

  return (completions * 3 + participants * 2 + views) * recencyMultiplier;
}

/**
 * Calculate and store trending quizzes
 */
async function calculateTrendingContent() {
  console.log('\n📊 Calculating trending content...');

  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Get all public quizzes
    const quizzesSnapshot = await db.collection('quizzes')
      .where('visibility', '==', 'public')
      .get();

    const scoredQuizzes = [];

    quizzesSnapshot.forEach(doc => {
      const quiz = doc.data();
      const score = calculateTrendingScore(quiz);

      if (score > 0) {
        scoredQuizzes.push({
          id: doc.id,
          title: quiz.title || 'Untitled',
          description: quiz.description || '',
          ownerId: quiz.ownerId,
          ownerDisplayName: quiz.ownerDisplayName || 'Unknown',
          category: quiz.category || 'general',
          difficulty: quiz.difficulty || 'medium',
          questionCount: quiz.questionCount || 0,
          trendingScore: score,
          totalCompletions: quiz.metadata?.totalCompletions || 0,
          totalParticipants: quiz.metadata?.totalParticipants || 0,
          createdAt: quiz.createdAt,
          updatedAt: quiz.updatedAt
        });
      }
    });

    // Sort by trending score (descending)
    scoredQuizzes.sort((a, b) => b.trendingScore - a.trendingScore);

    // Take top 50
    const topTrending = scoredQuizzes.slice(0, 50);

    // Store in Firestore
    const batch = db.batch();

    // Clear existing trending
    const existingTrending = await db.collection('trending').get();
    existingTrending.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Add new trending
    topTrending.forEach((quiz, index) => {
      const ref = db.collection('trending').doc(quiz.id);
      batch.set(ref, {
        ...quiz,
        rank: index + 1,
        calculatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    // Store summary
    const summaryRef = db.collection('system').doc('trendingStats');
    batch.set(summaryRef, {
      lastCalculated: admin.firestore.FieldValue.serverTimestamp(),
      totalQuizzesAnalyzed: quizzesSnapshot.size,
      trendingCount: topTrending.length
    });

    await batch.commit();

    console.log(`✅ Trending calculated: ${topTrending.length} quizzes from ${quizzesSnapshot.size} total`);

    return topTrending;
  } catch (error) {
    console.error('❌ Error calculating trending:', error);
    return [];
  }
}

// ============================================
// PERSONALIZED RECOMMENDATIONS
// ============================================

/**
 * Generate personalized recommendations for a user
 */
async function generateRecommendationsForUser(userId) {
  try {
    // Get user's learning history
    const userQuizzesSnapshot = await db.collection(`users/${userId}/userQuizzes`).get();

    // Track user preferences
    const categoryScores = {};
    const difficultyScores = {};
    const completedQuizIds = new Set();
    const followedAuthors = new Set();

    userQuizzesSnapshot.forEach(doc => {
      const data = doc.data();
      completedQuizIds.add(doc.id);

      if (data.category) {
        categoryScores[data.category] = (categoryScores[data.category] || 0) + 1;
      }
      if (data.difficulty) {
        difficultyScores[data.difficulty] = (difficultyScores[data.difficulty] || 0) + 1;
      }
    });

    // Get followed authors
    const followingSnapshot = await db.collection(`users/${userId}/following`).get();
    followingSnapshot.forEach(doc => {
      followedAuthors.add(doc.id);
    });

    // Find preferred category and difficulty
    const preferredCategory = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const preferredDifficulty = Object.entries(difficultyScores)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Get public quizzes not yet completed
    const quizzesSnapshot = await db.collection('quizzes')
      .where('visibility', '==', 'public')
      .limit(200)
      .get();

    const recommendations = [];

    quizzesSnapshot.forEach(doc => {
      if (completedQuizIds.has(doc.id)) return;

      const quiz = doc.data();
      let score = 0;

      // Category match bonus
      if (quiz.category === preferredCategory) {
        score += 30;
      }

      // Difficulty match bonus
      if (quiz.difficulty === preferredDifficulty) {
        score += 20;
      }

      // Followed author bonus
      if (followedAuthors.has(quiz.ownerId)) {
        score += 50;
      }

      // Popularity bonus (based on completions)
      const completions = quiz.metadata?.totalCompletions || 0;
      score += Math.min(completions * 2, 30);

      // Quality bonus (has description, good question count)
      if (quiz.description && quiz.description.length > 50) score += 5;
      if (quiz.questionCount >= 5 && quiz.questionCount <= 30) score += 10;

      recommendations.push({
        id: doc.id,
        title: quiz.title || 'Untitled',
        description: quiz.description || '',
        ownerId: quiz.ownerId,
        ownerDisplayName: quiz.ownerDisplayName || 'Unknown',
        category: quiz.category || 'general',
        difficulty: quiz.difficulty || 'medium',
        questionCount: quiz.questionCount || 0,
        score,
        reason: followedAuthors.has(quiz.ownerId) ? 'followed-author' :
                quiz.category === preferredCategory ? 'category-match' :
                quiz.difficulty === preferredDifficulty ? 'difficulty-match' : 'popular'
      });
    });

    // Sort by score and take top 20
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.slice(0, 20);

  } catch (error) {
    console.error(`Error generating recommendations for ${userId}:`, error);
    return [];
  }
}

/**
 * Batch generate recommendations for active users
 */
async function generateAllRecommendations() {
  console.log('\n🎯 Generating personalized recommendations...');

  try {
    // Get users who were active in the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const usersSnapshot = await db.collection('users')
      .where('lastLoginAt', '>', weekAgo)
      .limit(100) // Process 100 users per batch
      .get();

    let processed = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const recommendations = await generateRecommendationsForUser(userId);

      if (recommendations.length > 0) {
        // Store recommendations for this user
        const batch = db.batch();

        // Clear existing recommendations
        const existingRecs = await db.collection(`users/${userId}/recommendations`).get();
        existingRecs.forEach(doc => batch.delete(doc.ref));

        // Add new recommendations
        recommendations.forEach((rec, index) => {
          const ref = db.collection(`users/${userId}/recommendations`).doc(rec.id);
          batch.set(ref, {
            ...rec,
            rank: index + 1,
            generatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });

        await batch.commit();
        processed++;
      }
    }

    console.log(`✅ Recommendations generated for ${processed} users`);

  } catch (error) {
    console.error('❌ Error generating recommendations:', error);
  }
}

// ============================================
// ORPHAN DOCUMENT CLEANUP
// ============================================

/**
 * Clean up orphaned documents
 * - Questions without valid quizzes
 * - Progress records without valid quizzes/users
 * - Follow notifications older than 30 days
 */
async function cleanupOrphanedDocuments() {
  console.log('\n🧹 Starting orphan cleanup...');

  let deletedCount = 0;

  try {
    // 1. Find and delete orphaned questions
    console.log('  Checking for orphaned questions...');
    const questionsSnapshot = await db.collection('questions').get();
    const validQuizIds = new Set();

    // Get all valid quiz IDs
    const quizzesSnapshot = await db.collection('quizzes').get();
    quizzesSnapshot.forEach(doc => validQuizIds.add(doc.id));

    const orphanedQuestions = [];
    questionsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.quizId && !validQuizIds.has(data.quizId)) {
        orphanedQuestions.push(doc.ref);
      }
    });

    // Delete orphaned questions in batches
    if (orphanedQuestions.length > 0) {
      const batches = [];
      for (let i = 0; i < orphanedQuestions.length; i += 500) {
        const batch = db.batch();
        orphanedQuestions.slice(i, i + 500).forEach(ref => batch.delete(ref));
        batches.push(batch.commit());
      }
      await Promise.all(batches);
      deletedCount += orphanedQuestions.length;
      console.log(`  ✓ Deleted ${orphanedQuestions.length} orphaned questions`);
    }

    // 2. Clean up old follow notifications (older than 30 days)
    console.log('  Checking for old follow notifications...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldNotificationsSnapshot = await db.collection('followNotifications')
      .where('createdAt', '<', thirtyDaysAgo)
      .limit(500)
      .get();

    if (oldNotificationsSnapshot.size > 0) {
      const batch = db.batch();
      oldNotificationsSnapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedCount += oldNotificationsSnapshot.size;
      console.log(`  ✓ Deleted ${oldNotificationsSnapshot.size} old notifications`);
    }

    // 3. Check for orphaned quiz participants
    console.log('  Checking for orphaned quiz participants...');
    const quizParticipantsSnapshot = await db.collection('quizParticipants').get();
    const orphanedParticipantCollections = [];

    for (const doc of quizParticipantsSnapshot.docs) {
      if (!validQuizIds.has(doc.id)) {
        orphanedParticipantCollections.push(doc.id);
      }
    }

    // Delete orphaned participant collections
    for (const quizId of orphanedParticipantCollections) {
      const participantsSnapshot = await db.collection(`quizParticipants/${quizId}/participants`).get();
      if (participantsSnapshot.size > 0) {
        const batch = db.batch();
        participantsSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += participantsSnapshot.size;
      }
      // Delete the parent document
      await db.doc(`quizParticipants/${quizId}`).delete();
      deletedCount++;
    }

    if (orphanedParticipantCollections.length > 0) {
      console.log(`  ✓ Deleted ${orphanedParticipantCollections.length} orphaned participant collections`);
    }

    // 4. Check for orphaned quiz progress
    console.log('  Checking for orphaned quiz progress...');
    const quizProgressSnapshot = await db.collection('quizProgress').get();
    const orphanedProgressCollections = [];

    for (const doc of quizProgressSnapshot.docs) {
      if (!validQuizIds.has(doc.id)) {
        orphanedProgressCollections.push(doc.id);
      }
    }

    // Delete orphaned progress collections (simplified - just delete parent)
    for (const quizId of orphanedProgressCollections) {
      await db.doc(`quizProgress/${quizId}`).delete();
      deletedCount++;
    }

    if (orphanedProgressCollections.length > 0) {
      console.log(`  ✓ Deleted ${orphanedProgressCollections.length} orphaned progress collections`);
    }

    // Store cleanup stats
    await db.collection('system').doc('cleanupStats').set({
      lastRun: admin.firestore.FieldValue.serverTimestamp(),
      deletedCount,
      orphanedQuestions: orphanedQuestions.length,
      oldNotifications: oldNotificationsSnapshot.size,
      orphanedParticipants: orphanedParticipantCollections.length,
      orphanedProgress: orphanedProgressCollections.length
    });

    console.log(`✅ Cleanup complete: ${deletedCount} documents deleted`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// ============================================
// STORAGE QUOTA MONITORING
// ============================================

/**
 * Calculate and update storage usage for users
 */
async function updateStorageQuotas() {
  console.log('\n📦 Updating storage quotas...');

  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();

    let processed = 0;
    const quotaWarnings = [];

    const MAX_STORAGE_BYTES = 100 * 1024 * 1024; // 100MB per user
    const WARNING_THRESHOLD = 0.8; // Warn at 80%

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      let totalBytes = 0;

      // Count learning materials storage
      const materialsSnapshot = await db.collection('learningMaterials')
        .where('ownerId', '==', userId)
        .get();

      materialsSnapshot.forEach(doc => {
        const data = doc.data();
        // Estimate content size
        const contentSize = (data.content || '').length * 2; // UTF-16
        const imageCount = (data.images || []).length;
        totalBytes += contentSize + (imageCount * 500000); // Estimate 500KB per image
      });

      // Count flashcard decks storage
      const decksSnapshot = await db.collection('flashcardDecks')
        .where('ownerId', '==', userId)
        .get();

      for (const deckDoc of decksSnapshot.docs) {
        const cardsSnapshot = await db.collection(`flashcardDecks/${deckDoc.id}/cards`).get();
        cardsSnapshot.forEach(cardDoc => {
          const card = cardDoc.data();
          totalBytes += ((card.front || '').length + (card.back || '').length) * 2;
          if (card.imageUrl) totalBytes += 500000; // Estimate image size
        });
      }

      // Update user's storage usage
      const usagePercent = (totalBytes / MAX_STORAGE_BYTES) * 100;

      await db.doc(`users/${userId}`).update({
        storageUsed: totalBytes,
        storageLimit: MAX_STORAGE_BYTES,
        storagePercent: Math.round(usagePercent * 100) / 100
      });

      // Track users approaching limit
      if (usagePercent >= WARNING_THRESHOLD * 100) {
        quotaWarnings.push({
          userId,
          usagePercent: Math.round(usagePercent),
          bytesUsed: totalBytes
        });
      }

      processed++;
    }

    // Store quota summary
    await db.collection('system').doc('storageStats').set({
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      usersProcessed: processed,
      usersNearLimit: quotaWarnings.length,
      warnings: quotaWarnings.slice(0, 10) // Keep top 10 warnings
    });

    console.log(`✅ Storage quotas updated for ${processed} users`);
    if (quotaWarnings.length > 0) {
      console.log(`  ⚠️  ${quotaWarnings.length} users near storage limit`);
    }

  } catch (error) {
    console.error('❌ Error updating storage quotas:', error);
  }
}

// ============================================
// SCHEDULED JOBS
// ============================================

/**
 * Run scheduled maintenance tasks
 */
function startScheduledJobs() {
  console.log('\n⏰ Starting scheduled jobs...');

  // Trending: Every hour
  const TRENDING_INTERVAL = 60 * 60 * 1000; // 1 hour
  setInterval(async () => {
    await calculateTrendingContent();
  }, TRENDING_INTERVAL);

  // Recommendations: Every 6 hours
  const RECOMMENDATIONS_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  setInterval(async () => {
    await generateAllRecommendations();
  }, RECOMMENDATIONS_INTERVAL);

  // Cleanup: Every 24 hours
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  setInterval(async () => {
    await cleanupOrphanedDocuments();
  }, CLEANUP_INTERVAL);

  // Storage quotas: Every 12 hours
  const STORAGE_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours
  setInterval(async () => {
    await updateStorageQuotas();
  }, STORAGE_INTERVAL);

  // Run initial calculations after a short delay
  setTimeout(async () => {
    console.log('\n🚀 Running initial calculations...');
    await calculateTrendingContent();
    await generateAllRecommendations();
    // Don't run cleanup/storage on startup to avoid issues
  }, 10000); // 10 seconds after startup

  console.log('✅ Scheduled jobs configured:');
  console.log('   - Trending: Every hour');
  console.log('   - Recommendations: Every 6 hours');
  console.log('   - Cleanup: Every 24 hours');
  console.log('   - Storage Quotas: Every 12 hours');
}

// ============================================
// HTTP SERVER & ENDPOINTS
// ============================================

/**
 * Health check endpoint for Render.com
 */
import { createServer } from 'http';

const server = createServer(async (req, res) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;

  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      listeners: {
        quizzes: 'active',
        questions: 'active',
        followNotifications: 'active'
      },
      scheduledJobs: {
        trending: 'hourly',
        recommendations: 'every 6h',
        cleanup: 'daily',
        storageQuotas: 'every 12h'
      }
    }));
  }
  // API endpoint to manually trigger trending calculation
  else if (path === '/api/trending/calculate' && req.method === 'POST') {
    console.log('📊 Manual trending calculation triggered');
    await calculateTrendingContent();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Trending calculated' }));
  }
  // API endpoint to manually trigger recommendations
  else if (path === '/api/recommendations/generate' && req.method === 'POST') {
    console.log('🎯 Manual recommendations generation triggered');
    await generateAllRecommendations();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Recommendations generated' }));
  }
  // API endpoint to manually trigger cleanup
  else if (path === '/api/cleanup' && req.method === 'POST') {
    console.log('🧹 Manual cleanup triggered');
    await cleanupOrphanedDocuments();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Cleanup completed' }));
  }
  // API endpoint to manually trigger storage quota update
  else if (path === '/api/storage/update' && req.method === 'POST') {
    console.log('📦 Manual storage quota update triggered');
    await updateStorageQuotas();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Storage quotas updated' }));
  }
  // Get system stats
  else if (path === '/api/stats' && req.method === 'GET') {
    try {
      const [trendingStats, cleanupStats, storageStats] = await Promise.all([
        db.collection('system').doc('trendingStats').get(),
        db.collection('system').doc('cleanupStats').get(),
        db.collection('system').doc('storageStats').get()
      ]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        trending: trendingStats.data() || {},
        cleanup: cleanupStats.data() || {},
        storage: storageStats.data() || {}
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health\n`);

  // Start Firestore listeners
  startQuizListener();
  startFollowNotificationListener();

  // Start scheduled background jobs
  startScheduledJobs();

  console.log('\n🎉 Notification server is ready!\n');
  console.log('📡 Active listeners:');
  console.log('   - Quiz changes (updates, title, description)');
  console.log('   - Follow notifications (new/updated content from followed author)');
  console.log('');
  console.log('🔄 Scheduled jobs:');
  console.log('   - Trending content calculation (hourly)');
  console.log('   - Personalized recommendations (every 6h)');
  console.log('   - Orphan cleanup (daily)');
  console.log('   - Storage quota monitoring (every 12h)\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
