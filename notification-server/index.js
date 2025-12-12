import admin from 'firebase-admin';

// ============================================
// RecallFlow Quiz Notification Server
// Free deployment on Render.com
// ============================================

console.log('🚀 Starting RecallFlow Notification Server...');

// Initialize Firebase Admin with service account
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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

/**
 * Get all user FCM tokens
 */
async function getUserTokens(userId) {
  try {
    const tokensSnapshot = await db.collection(`users/${userId}/fcmTokens`).get();
    const tokens = [];

    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) {
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
 * Send push notification to users
 */
async function sendNotification(tokens, title, body, quizId, type) {
  if (tokens.length === 0) {
    console.log('  ⚠️  No tokens to send to');
    return;
  }

  const payload = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      quizId,
      type,
      action: 'view-quiz',
      timestamp: Date.now().toString()
    },
    webpush: {
      notification: {
        icon: '/assets/icons/icon-192x192.png',
      },
      fcmOptions: {
        link: `https://recall-flow-app.web.app/quizzes/${quizId}`,
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
 * Health check endpoint for Render.com
 */
import { createServer } from 'http';

const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      listeners: {
        quizzes: 'active',
        questions: 'active'
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

  console.log('\n🎉 Notification server is ready!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
