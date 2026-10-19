const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { randomBytes } = require('crypto');
const { admin } = require('../shared/admin');
const { sendEmail } = require('../shared/email');
const { getFrontendUrl } = require('../billing/stripe');

const DAY_MS = 24 * 60 * 60 * 1000;

function surveyWindow(now = Date.now()) {
  return {
    start: new Date(now - 6 * DAY_MS),
    end: new Date(now - 5 * DAY_MS),
  };
}

async function sendTrialSurveyReminders() {
  const db = admin.firestore();
  const { start, end } = surveyWindow();
  const snap = await db.collection('users')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();

  let invited = 0;
  let skipped = 0;
  const frontend = getFrontendUrl().replace(/\/$/, '');

  for (const docSnap of snap.docs) {
    const user = docSnap.data() || {};
    const sub = user.subscription || {};
    if (user.surveyInvitedAt) {
      skipped += 1;
      continue;
    }
    if (sub.stripeSubscriptionId || (sub.plan && sub.plan !== 'trial')) {
      skipped += 1;
      continue;
    }
    if (!user.email) {
      skipped += 1;
      continue;
    }

    const token = randomBytes(24).toString('hex');
    const link = `${frontend}/feedback?token=${token}`;
    const name = user.fullName || 'there';
    const surveyRef = db.collection('trialSurveys').doc(token);

    await surveyRef.set({
      uid: docSnap.id,
      email: user.email,
      fullName: user.fullName || '',
      status: 'invited',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      answers: null,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'How is your RE AIssistant trial going?',
        text: `Hi ${name},\n\nYou are on day 5 of your free 7-day trial. Four quick questions help us improve, and if it is working for you, you can add billing info at the end.\n\n${link}\n\n— RE AIssistant`,
      });
    } catch (error) {
      console.error(`trial survey email failed for ${docSnap.id}:`, error.message);
      await surveyRef.delete().catch(() => {});
      skipped += 1;
      continue;
    }

    await docSnap.ref.set({
      surveyInvitedAt: admin.firestore.FieldValue.serverTimestamp(),
      surveyToken: token,
    }, { merge: true });
    invited += 1;
  }

  return { invited, skipped, scanned: snap.size };
}

function clampText(value) {
  return String(value || '').trim().slice(0, 1000);
}

exports.sendTrialSurveyReminders = onSchedule({ schedule: 'every 24 hours', secrets: ['FRONTEND_URL'] }, async () => {
  try {
    const result = await sendTrialSurveyReminders();
    console.log('sendTrialSurveyReminders', result);
  } catch (error) {
    console.error('sendTrialSurveyReminders error', error);
  }
});

exports.submitTrialSurvey = onCall(async (request) => {
  const token = String(request.data?.token || '').trim();
  if (!/^[a-f0-9]{48}$/.test(token)) {
    throw new HttpsError('invalid-argument', 'A valid survey link is required');
  }

  const score = Number(request.data?.score);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new HttpsError('invalid-argument', 'Score must be a whole number from 0 to 10');
  }

  const wouldPayRaw = request.data?.wouldPay;
  if (wouldPayRaw !== true && wouldPayRaw !== false && wouldPayRaw !== 'yes' && wouldPayRaw !== 'no') {
    throw new HttpsError('invalid-argument', 'Tell us whether you would continue');
  }

  const ref = admin.firestore().collection('trialSurveys').doc(token);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'This survey link is invalid');
  }
  if (snap.data().status === 'submitted') {
    throw new HttpsError('already-exists', 'This survey was already submitted');
  }

  await ref.set({
    status: 'submitted',
    answers: {
      used: clampText(request.data?.used),
      missing: clampText(request.data?.missing),
      wouldPay: wouldPayRaw === true || wouldPayRaw === 'yes',
      score,
    },
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true };
});
