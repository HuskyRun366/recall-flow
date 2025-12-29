import admin from 'firebase-admin';

// ============================================
// RecallFlow Quiz Notification Server
// Free deployment on Render.com
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
const quizQuestionCounts = new Map();

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

      if (change.type === 'modified') {
        // Get previous state
        const lastUpdate = quizLastUpdated.get(quizId);
        const currentUpdate = data.updatedAt?.toDate() || new Date();

        // Skip if this is initial load or not a real update
        if (!lastUpdate || currentUpdate <= lastUpdate) {
          quizLastUpdated.set(quizId, currentUpdate);
          return;
        }

        // Real update detected
        await handleQuizUpdate(quizId, null, data);
        quizLastUpdated.set(quizId, currentUpdate);
      }

      // Track question count for this quiz
      if (data.questionCount !== undefined) {
        const oldCount = quizQuestionCounts.get(quizId);
        const newCount = data.questionCount;

        if (oldCount !== undefined && oldCount !== newCount) {
          await handleQuestionCountChange(quizId, data.title, oldCount, newCount);
        }

        quizQuestionCounts.set(quizId, newCount);
      }
    });
  }, error => {
    console.error('❌ Quiz listener error:', error);
  });

  console.log('✅ Quiz listener active');
}

/**
 * Start listening to question changes
 */
function startQuestionListener() {
  console.log('👂 Starting question change listener...');

  // Track question counts per quiz
  const questionCountsByQuiz = new Map();

  db.collection('questions').onSnapshot(snapshot => {
    // Count questions per quiz
    const currentCounts = new Map();

    snapshot.forEach(doc => {
      const data = doc.data();
      const quizId = data.quizId;

      if (quizId) {
        currentCounts.set(quizId, (currentCounts.get(quizId) || 0) + 1);
      }
    });

    // Check for changes
    snapshot.docChanges().forEach(async change => {
      const data = change.doc.data();
      const quizId = data.quizId;

      if (!quizId) return;

      // Get quiz info
      const quizDoc = await db.doc(`quizzes/${quizId}`).get();
      if (!quizDoc.exists) return;

      const quizTitle = quizDoc.data().title || 'Quiz';
      const oldCount = questionCountsByQuiz.get(quizId) || 0;
      const newCount = currentCounts.get(quizId) || 0;

      if (oldCount !== newCount && oldCount > 0) {
        await handleQuestionCountChange(quizId, quizTitle, oldCount, newCount);
      }
    });

    // Update tracked counts
    currentCounts.forEach((count, quizId) => {
      questionCountsByQuiz.set(quizId, count);
    });
  }, error => {
    console.error('❌ Question listener error:', error);
  });

  console.log('✅ Question listener active');
}

/**
 * Get notification title and body based on content type
 */
function getNotificationText(contentType, authorName, contentTitle) {
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
 * Handle follow notification (new content from followed author)
 */
async function handleFollowNotification(notificationId, data) {
  // Get content info - support both new generic fields and legacy quiz-only fields
  const contentType = data.contentType || 'quiz';
  const contentId = data.contentId || data.quizId;
  const contentTitle = data.contentTitle || data.quizTitle;

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
  const notificationText = getNotificationText(contentType, authorName, sanitizedTitle);

  console.log(`${notificationText.emoji} Follow notification: "${authorName}" published "${sanitizedTitle}" (${contentType})`);
  console.log(`   Target user: ${data.userId.substring(0, 8)}...`);

  // Get user's tokens
  const tokens = await getUserTokens(data.userId);

  if (tokens.length === 0) {
    console.log('  ℹ️  No tokens for this user');
    return;
  }

  // Send notification with content type for proper URL routing
  await sendNotification(
    tokens,
    notificationText.title,
    notificationText.body,
    contentId,
    `new-${contentType}-from-following`,
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

  // Valid notification types to process
  const validTypes = ['new-quiz', 'new-flashcard-deck', 'new-material'];

  // Listen only to unread notifications that haven't been push-sent yet
  db.collection('followNotifications')
    .where('read', '==', false)
    .where('pushSent', '==', false)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const notificationId = change.doc.id;
          const data = change.doc.data();

          // Process all valid content type notifications
          if (validTypes.includes(data.type)) {
            await handleFollowNotification(notificationId, data);
          }
        }
      });
    }, error => {
      console.error('❌ Follow notification listener error:', error);
    });

  // Also listen for notifications without pushSent field (backwards compatibility)
  db.collection('followNotifications')
    .where('read', '==', false)
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const notificationId = change.doc.id;
          const data = change.doc.data();

          // Only process if pushSent is undefined (not yet processed)
          if (validTypes.includes(data.type) && data.pushSent === undefined) {
            await handleFollowNotification(notificationId, data);
          }
        }
      });
    }, error => {
      // Ignore errors for this secondary listener
    });

  console.log('✅ Follow notification listener active');
}

/**
 * Health check endpoint for Render.com
 */
import { createServer } from 'http';

const server = createServer((req, res) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      listeners: {
        quizzes: 'active',
        questions: 'active',
        followNotifications: 'active'
      }
    }));
  } else {
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
  startQuestionListener();
  startFollowNotificationListener();

  console.log('\n🎉 Notification server is ready!\n');
  console.log('📡 Active listeners:');
  console.log('   - Quiz changes (updates, title, description)');
  console.log('   - Question changes (added, deleted)');
  console.log('   - Follow notifications (new quiz from followed author)\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
