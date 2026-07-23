const { onCall } = require('firebase-functions/v2/https');
const { admin } = require('../shared/admin');
const sendgrid = require('@sendgrid/mail');
const { getTwilioClient, getTwilioFromNumber } = require('../shared/twilio');

// Send verification code for open house check-in
exports.sendOpenHouseVerificationCode = onCall(async (request) => {
  try {
    const { phoneNumber, openHouseId, visitorName } = request.data

    // Validate input
    if (!phoneNumber || !openHouseId || !visitorName) {
      throw new Error('Missing required fields')
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    // Store verification code in Firestore with expiration (10 minutes)
    const verificationRef = admin.firestore().collection('openHouseVerifications').doc(openHouseId)
    await verificationRef.set({
      phoneNumber,
      visitorName,
      verificationCode,
      openHouseId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), // 10 minutes
      used: false
    })

    // Send SMS via Twilio
    const message = await getTwilioClient().messages.create({
      body: `Your RE AIssistant verification code is: ${verificationCode}. This code expires in 10 minutes. Welcome to the open house, ${visitorName}!`,
      from: getTwilioFromNumber(),
      to: phoneNumber
    })

    console.log(`Verification code sent to ${phoneNumber} for open house ${openHouseId}`)

    return {
      success: true,
      messageId: message.sid
    }

  } catch (error) {
    console.error('Error sending verification code:', error)
    throw new Error('Failed to send verification code')
  }
})

// Verify code and check in visitor
exports.verifyOpenHouseCodeAndCheckIn = onCall(async (request) => {
  try {
    const { phoneNumber, verificationCode, openHouseId, visitorInfo } = request.data

    // Validate input
    if (!phoneNumber || !verificationCode || !openHouseId || !visitorInfo) {
      throw new Error('Missing required fields')
    }

    // Get verification record
    const verificationRef = admin.firestore().collection('openHouseVerifications').doc(openHouseId)
    const verificationDoc = await verificationRef.get()

    if (!verificationDoc.exists) {
      throw new Error('Verification code not found')
    }

    const verificationData = verificationDoc.data()

    // Check if code has expired
    if (verificationData.expiresAt.toDate() < new Date()) {
      throw new Error('Verification code has expired')
    }

    // Check if code has already been used
    if (verificationData.used) {
      throw new Error('Verification code has already been used')
    }

    // Verify the code
    if (verificationData.verificationCode !== verificationCode) {
      throw new Error('Invalid verification code')
    }

    // Mark verification as used
    await verificationRef.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    })

    // Get open house details
    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    // Add visitor to open house
    await openHouseRef.update({
      visitors: admin.firestore.FieldValue.arrayUnion({
        ...visitorInfo,
        phone: phoneNumber,
        checkInTime: admin.firestore.FieldValue.serverTimestamp(),
        verified: true,
        verificationId: openHouseId
      })
    })

    // Send welcome SMS
    try {
      await getTwilioClient().messages.create({
        body: `Welcome to the open house, ${visitorInfo.name}! Thank you for checking in. Our agent will be in touch soon with more details.`,
        from: getTwilioFromNumber(),
        to: phoneNumber
      })
    } catch (smsError) {
      console.error('Error sending welcome SMS:', smsError)
      // Don't fail the check-in if SMS fails
    }

    // Send confirmation email (best-effort)
    try {
      if (process.env.SENDGRID_API_KEY && visitorInfo.email) {
        sendgrid.setApiKey(process.env.SENDGRID_API_KEY)
        await sendgrid.send({
          to: visitorInfo.email,
          from: process.env.SEND_FROM_EMAIL || 'no-reply@reaissistant.com',
          subject: `You're checked in: ${openHouseDoc.data().title || 'Open House'}`,
          text: `Thanks for checking in, ${visitorInfo.name}. Address: ${openHouseDoc.data().address}. ${openHouseDoc.data().date} ${openHouseDoc.data().startTime} - ${openHouseDoc.data().endTime}.`,
          html: `<p>Thanks for checking in, <strong>${visitorInfo.name}</strong>.</p>
                 <p><strong>Address:</strong> ${openHouseDoc.data().address}</p>
                 <p><strong>Time:</strong> ${openHouseDoc.data().date} ${openHouseDoc.data().startTime} - ${openHouseDoc.data().endTime}</p>`
        })
      }
    } catch (emailErr) {
      console.error('Error sending check-in email:', emailErr)
    }

    console.log(`Visitor ${visitorInfo.name} successfully checked in to open house ${openHouseId}`)

    return {
      success: true,
      message: 'Successfully checked in'
    }

  } catch (error) {
    console.error('Error verifying code and checking in:', error)
    throw new Error('Failed to verify code and check in')
  }
})

// Get open house details
exports.getOpenHouseDetails = onCall(async (request) => {
  try {
    const { openHouseId } = request.data

    if (!openHouseId) {
      throw new Error('Open house ID required')
    }

    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    const openHouseData = openHouseDoc.data()

    return {
      success: true,
      openHouse: {
        id: openHouseDoc.id,
        ...openHouseData
      }
    }

  } catch (error) {
    console.error('Error getting open house details:', error)
    throw new Error('Failed to get open house details')
  }
})

// Check in visitor (alternative method)
exports.checkInVisitor = onCall(async (request) => {
  try {
    const { openHouseId, visitorInfo } = request.data

    if (!openHouseId || !visitorInfo) {
      throw new Error('Missing required fields')
    }

    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    // Add visitor to open house
    await openHouseRef.update({
      visitors: admin.firestore().FieldValue.arrayUnion({
        ...visitorInfo,
        checkInTime: admin.firestore.FieldValue.serverTimestamp(),
        verified: true
      })
    })

    console.log(`Visitor ${visitorInfo.name} checked in to open house ${openHouseId}`)

    return {
      success: true,
      message: 'Visitor checked in successfully'
    }

  } catch (error) {
    console.error('Error checking in visitor:', error)
    throw new Error('Failed to check in visitor')
  }
})

// Request digital flyer
exports.requestDigitalFlyer = onCall(async (request) => {
  try {
    const { openHouseId, visitorEmail, visitorName } = request.data

    if (!openHouseId || !visitorEmail || !visitorName) {
      throw new Error('Missing required fields')
    }

    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    const openHouseData = openHouseDoc.data()

    // Store flyer request
    await admin.firestore().collection('flyerRequests').add({
      openHouseId,
      visitorEmail,
      visitorName,
      flyerContent: {
        title: openHouseData.title,
        address: openHouseData.address,
        date: openHouseData.date,
        time: `${openHouseData.startTime} - ${openHouseData.endTime}`,
        propertyDetails: openHouseData.propertyDetails,
        description: openHouseData.description
      },
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })

    console.log(`Flyer request created for ${visitorEmail} for open house ${openHouseId}`)

    return {
      success: true,
      message: 'Digital flyer request submitted successfully'
    }

  } catch (error) {
    console.error('Error requesting flyer:', error)
    throw new Error('Failed to request flyer')
  }
})

// Send follow-up messages
exports.sendFollowUpMessages = onCall(async (request) => {
  try {
    const { openHouseId, message, visitorIds } = request.data

    if (!openHouseId || !message) {
      throw new Error('Missing required fields')
    }

    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    const openHouseData = openHouseDoc.data()
    const visitors = openHouseData.visitors || []

    // Filter visitors if specific IDs provided
    const targetVisitors = visitorIds 
      ? visitors.filter(v => visitorIds.includes(v.verificationId))
      : visitors

    // Send follow-up messages
    const results = []
    for (const visitor of targetVisitors) {
      if (visitor.phone) {
        try {
          const followUpMessage = await getTwilioClient().messages.create({
            body: `Hi ${visitor.name}! ${message}`,
            from: getTwilioFromNumber(),
            to: visitor.phone
          })

          results.push({
            visitorId: visitor.verificationId,
            visitorName: visitor.name,
            success: true,
            messageId: followUpMessage.sid
          })
        } catch (error) {
          results.push({
            visitorId: visitor.verificationId,
            visitorName: visitor.name,
            success: false,
            error: error.message
          })
        }
      }
    }

    // Log follow-up activity
    await openHouseRef.update({
      followUps: admin.firestore.FieldValue.arrayUnion({
        message,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        targetCount: targetVisitors.length,
        results
      })
    })

    return {
      success: true,
      results,
      message: `Follow-up messages sent to ${targetVisitors.length} visitors`
    }

  } catch (error) {
    console.error('Error sending follow-up messages:', error)
    throw new Error('Failed to send follow-up messages')
  }
})

// Schedule reminder SMS before start — writes unified scheduledTasks (Phase 10)
exports.scheduleOpenHouseReminder = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  async (request) => {
  try {
    const { openHouseId } = request.data
    if (!openHouseId) throw new Error('openHouseId required')
    const db = admin.firestore()
    const openHouseRef = db.collection('openHouses').doc(openHouseId)
    const oh = await openHouseRef.get()
    if (!oh.exists) throw new Error('Open house not found')
    const openHouse = { id: oh.id, ...oh.data() }

    const {
      loadSettings,
      loadAgentProfile,
      enqueueTask,
      buildTaskForOpenHouseReminder,
    } = require('../automations/enqueue')

    const ownerUid = openHouse.agentId || openHouse.ownerUid
    const settings = await loadSettings(db, ownerUid)
    // Explicit schedule from UI always enqueues (force enable for this call)
    const forced = {
      ...settings,
      rules: {
        ...settings.rules,
        openHouseAgentReminderSms: {
          ...settings.rules.openHouseAgentReminderSms,
          enabled: true,
        },
      },
    }
    const agentProfile = await loadAgentProfile(db, ownerUid)
    const task = buildTaskForOpenHouseReminder(openHouse, agentProfile, forced)
    if (!task) throw new Error('Could not build reminder (missing phone/date/time)')
    const result = await enqueueTask(db, task)
    return { success: true, ...result }
  } catch (e) {
    console.error('scheduleOpenHouseReminder error', e)
    throw new Error(e.message || 'Failed to schedule reminder')
  }
})

// Background processor — delegates to unified scheduledTasks engine + drains legacy docs
exports.processOpenHouseReminders = async () => {
  const { processScheduledTasks } = require('../automations/worker')
  return processScheduledTasks()
}

// Get open house analytics
exports.getOpenHouseAnalytics = onCall(async (request) => {
  try {
    const { openHouseId } = request.data

    if (!openHouseId) {
      throw new Error('Open house ID required')
    }

    const openHouseRef = admin.firestore().collection('openHouses').doc(openHouseId)
    const openHouseDoc = await openHouseRef.get()

    if (!openHouseDoc.exists) {
      throw new Error('Open house not found')
    }

    const openHouseData = openHouseDoc.data()
    const visitors = openHouseData.visitors || []

    // Calculate analytics
    const analytics = {
      totalVisitors: visitors.length,
      verifiedVisitors: visitors.filter(v => v.verified).length,
      interestLevels: {},
      budgetRanges: {},
      checkInTimes: [],
      averageCheckInDuration: 0
    }

    // Analyze visitor data
    visitors.forEach(visitor => {
      if (visitor.interestLevel) {
        analytics.interestLevels[visitor.interestLevel] = 
          (analytics.interestLevels[visitor.interestLevel] || 0) + 1
      }
      
      if (visitor.budget) {
        analytics.budgetRanges[visitor.budget] = 
          (analytics.budgetRanges[visitor.budget] || 0) + 1
      }

      if (visitor.checkInTime) {
        analytics.checkInTimes.push(visitor.checkInTime.toDate())
      }
    })

    return {
      success: true,
      analytics
    }

  } catch (error) {
    console.error('Error getting open house analytics:', error)
    throw new Error('Failed to get analytics')
  }
})

// Submit feedback for an open house (public)
exports.submitOpenHouseFeedback = onCall(async (request) => {
  try {
    const { openHouseId, rating, comments, visitorName } = request.data

    if (!openHouseId || typeof rating !== 'number') {
      throw new Error('Missing required fields')
    }

    const feedback = {
      openHouseId,
      rating: Math.max(1, Math.min(5, rating)),
      comments: comments || '',
      visitorName: visitorName || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }

    await admin.firestore().collection('openHouseFeedback').add(feedback)

    return { success: true }
  } catch (error) {
    console.error('Error submitting feedback:', error)
    throw new Error('Failed to submit feedback')
  }
})