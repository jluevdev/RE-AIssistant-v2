import React, { useState, useEffect } from 'react'
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  User, 
  Home, 
  DollarSign,
  Star,
  CheckCircle,
  AlertCircle,
  Building,
  Bed,
  Bath,
  Square,
  Users
} from 'lucide-react'
import { collection, addDoc, doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../config/firebase'
import { Helmet } from 'react-helmet'
import { useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'

function FeedbackAndFlyer({ openHouseId, name, email }) {
  const [rating, setRating] = useState(5)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sendingFlyer, setSendingFlyer] = useState(false)

  const handleSubmitFeedback = async () => {
    try {
      setSubmitting(true)
      const submit = httpsCallable(functions, 'submitOpenHouseFeedback')
      await submit({ openHouseId, rating, comments, visitorName: name })
      toast.success('Thanks for the feedback!')
    } catch (e) {
      console.error('submit feedback error', e)
      toast.error('Could not submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendFlyer = async () => {
    try {
      setSendingFlyer(true)
      const requestFlyer = httpsCallable(functions, 'requestDigitalFlyer')
      await requestFlyer({ openHouseId, visitorEmail: email, visitorName: name })
      toast.success('Digital flyer sent!')
    } catch (e) {
      console.error('send flyer error', e)
      toast.error('Unable to send flyer right now')
    } finally {
      setSendingFlyer(false)
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 mb-6 text-left">
      <h3 className="font-semibold text-gray-900 mb-2">How was your experience?</h3>
      <div className="flex items-center gap-2 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`w-8 h-8 rounded-full border text-sm ${rating >= n ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-600'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
        rows="3"
        placeholder="Any comments for the agent…"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" onClick={handleSubmitFeedback} disabled={submitting} className="px-4 py-2 bg-gray-900 text-white rounded-md disabled:opacity-60">
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button type="button" onClick={handleSendFlyer} disabled={sendingFlyer} className="px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-60">
          {sendingFlyer ? 'Sending…' : 'Send Flyer'}
        </button>
      </div>
    </div>
  )
}

export default function PublicCheckIn() {
  const { openHouseId } = useParams()
  const [openHouse, setOpenHouse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkInForm, setCheckInForm] = useState({
    name: '',
    email: '',
    phone: '',
    interestLevel: 'Somewhat Interested',
    budget: '',
    propertyType: '',
    timeline: '',
    notes: '',
    source: 'Open House'
  })
  const [checkInSuccess, setCheckInSuccess] = useState(false)
  const [recentVisitors, setRecentVisitors] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verifying, setVerifying] = useState(false)

  const interestLevels = [
    'Very Interested',
    'Interested', 
    'Somewhat Interested',
    'Not Interested'
  ]

  const propertyTypes = [
    'Single Family',
    'Townhouse',
    'Condo',
    'Multi-family',
    'Land',
    'Other'
  ]

  const timelines = [
    'Immediately',
    'Within 30 days',
    'Within 3 months',
    'Within 6 months',
    'Within 1 year',
    'Just browsing'
  ]

  useEffect(() => {
    if (openHouseId) {
      loadOpenHouse()
      loadRecentVisitors()
    }
  }, [openHouseId])

  const loadOpenHouse = async () => {
    try {
      const openHouseDoc = await getDoc(doc(db, 'openHouses', openHouseId))
      if (openHouseDoc.exists()) {
        setOpenHouse({ id: openHouseDoc.id, ...openHouseDoc.data() })
      } else {
        toast.error('Open house not found')
      }
    } catch (error) {
      console.error('Error loading open house:', error)
      toast.error('Failed to load open house details')
    } finally {
      setLoading(false)
    }
  }

  const loadRecentVisitors = async () => {
    try {
      setAnalyticsLoading(true)
      const getAnalytics = httpsCallable(functions, 'getOpenHouseAnalytics')
      const { data } = await getAnalytics({ openHouseId })
      setAnalytics(data?.analytics || null)
    } catch (error) {
      console.error('Error loading recent visitors:', error)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const handleCheckIn = async () => {
    try {
      if (!checkInForm.name.trim() || !checkInForm.email.trim()) {
        toast.error('Please provide name and email')
        return
      }

      if (!checkInForm.phone.trim()) {
        toast.error('Phone number is required for verification')
        return
      }

      if (!codeSent) {
        setSendingCode(true)
        try {
          const sendCode = httpsCallable(functions, 'sendOpenHouseVerificationCode')
          await sendCode({
            phoneNumber: checkInForm.phone,
            openHouseId,
            visitorName: checkInForm.name
          })
          setCodeSent(true)
          toast.success('Verification code sent via SMS')
        } finally {
          setSendingCode(false)
        }
        return
      }

      if (!verificationCode || verificationCode.trim().length !== 6) {
        toast.error('Enter the 6-digit verification code')
        return
      }

      setVerifying(true)
      try {
        const verify = httpsCallable(functions, 'verifyOpenHouseCodeAndCheckIn')
        await verify({
          phoneNumber: checkInForm.phone,
          verificationCode: verificationCode.trim(),
          openHouseId,
          visitorInfo: {
            name: checkInForm.name,
            email: checkInForm.email,
            interestLevel: checkInForm.interestLevel,
            budget: checkInForm.budget,
            propertyType: checkInForm.propertyType,
            timeline: checkInForm.timeline,
            notes: checkInForm.notes,
            source: checkInForm.source
          }
        })

        const visitorData = {
          ...checkInForm,
          openHouseId: openHouseId,
          agentId: openHouse.agentId,
          checkInTime: new Date(),
          status: 'Checked In',
          followUpStatus: 'Pending',
          verified: true
        }
        await addDoc(collection(db, 'openHouseVisitors'), visitorData)

        toast.success('Welcome to the open house!')
        setCheckInSuccess(true)
        loadRecentVisitors()
      } finally {
        setVerifying(false)
      }
    } catch (error) {
      console.error('Error checking in visitor:', error)
      toast.error(error?.message || 'Failed to check in. Please try again.')
    }
  }

  const formatTime = (timeString) => {
    if (!timeString) return ''
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
    return `${displayHour}:${minutes} ${ampm}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading open house details...</p>
        </div>
      </div>
    )
  }

  if (!openHouse) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Open House Not Found</h2>
          <p className="text-gray-600 mb-4">The open house you're looking for doesn't exist or has been removed.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-700">Return to Home</Link>
        </div>
      </div>
    )
  }

  if (checkInSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to the Open House!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for checking in, <span className="font-semibold">{checkInForm.name}</span>! 
            Our agent will be in touch soon with more details.
          </p>
          
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Open House Details</h3>
            <p className="text-blue-800 text-sm">{openHouse.address}</p>
            <p className="text-blue-800 text-sm">
              {new Date(openHouse.date).toLocaleDateString()} • {formatTime(openHouse.startTime)} - {formatTime(openHouse.endTime)}
            </p>
          </div>

					{/* Feedback and Digital Flyer */}
					<FeedbackAndFlyer
						openHouseId={openHouse.id}
						name={checkInForm.name}
						email={checkInForm.email}
					/>

          <button
            onClick={() => setCheckInSuccess(false)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Check In Another Person
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Open House Check-In</title>
        <meta name="description" content="Check in to this open house and share your preferences with the agent." />
        <meta property="og:title" content="Open House Check-In" />
        <meta property="og:description" content="Check in to this open house and share your preferences with the agent." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/app-screenshot.svg" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Open House Check-In</h1>
              <p className="text-gray-600">Welcome! Please check in to let us know you're here.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Check-in Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Visitor Check-In</h2>
              
              <form onSubmit={(e) => { e.preventDefault(); handleCheckIn(); }} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={checkInForm.name}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={checkInForm.email}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      required
                      value={checkInForm.phone}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Interest Level</label>
                    <select
                      value={checkInForm.interestLevel}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, interestLevel: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {interestLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget Range</label>
                    <input
                      type="text"
                      value={checkInForm.budget}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, budget: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., $300k - $500k"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                    <select
                      value={checkInForm.propertyType}
                      onChange={(e) => setCheckInForm(prev => ({ ...prev, propertyType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select type</option>
                      {propertyTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Timeline</label>
                  <select
                    value={checkInForm.timeline}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, timeline: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select timeline</option>
                    {timelines.map(timeline => (
                      <option key={timeline} value={timeline}>{timeline}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                  <textarea
                    value={checkInForm.notes}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="3"
                    placeholder="Any specific requirements or questions..."
                  />
                </div>

                {codeSent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="123456"
                      />
                      <button
                        type="button"
                        onClick={handleCheckIn}
                        disabled={verifying}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-md"
                      >
                        {verifying ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCodeSent(false); setVerificationCode(''); setTimeout(() => handleCheckIn(), 0) }}
                      disabled={sendingCode}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      {sendingCode ? 'Resending…' : 'Resend code'}
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sendingCode || verifying}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>{codeSent ? 'Verify & Check In' : (sendingCode ? 'Sending Code…' : 'Send Code')}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Open House Details & Recent Visitors */}
          <div className="space-y-6">
            {/* Open House Details */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Open House Details</h3>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">{openHouse.address}</p>
                    {openHouse.description && (
                      <p className="text-sm text-gray-600">{openHouse.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(openHouse.date).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600">Date</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatTime(openHouse.startTime)} - {formatTime(openHouse.endTime)}
                    </p>
                    <p className="text-sm text-gray-600">Time</p>
                  </div>
                </div>

                {openHouse.propertyDetails && (
                  <>
                    {openHouse.propertyDetails.price && (
                      <div className="flex items-center space-x-3">
                        <DollarSign className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">
                            ${openHouse.propertyDetails.price.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-600">Price</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 pt-2">
                      {openHouse.propertyDetails.beds && (
                        <div className="text-center">
                          <Bed className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                          <p className="font-medium text-gray-900">{openHouse.propertyDetails.beds}</p>
                          <p className="text-xs text-gray-600">Beds</p>
                        </div>
                      )}
                      {openHouse.propertyDetails.baths && (
                        <div className="text-center">
                          <Bath className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                          <p className="font-medium text-gray-900">{openHouse.propertyDetails.baths}</p>
                          <p className="text-xs text-gray-600">Baths</p>
                        </div>
                      )}
                      {openHouse.propertyDetails.sqft && (
                        <div className="text-center">
                          <Square className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                          <p className="font-medium text-gray-900">{openHouse.propertyDetails.sqft}</p>
                          <p className="text-xs text-gray-600">Sq Ft</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Recent Visitors (counts only, no PII) */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Recent Visitors</h3>
                <p className="text-sm text-gray-600">Today's check-ins</p>
              </div>
              <div className="px-6 py-5">
                {analyticsLoading ? (
                  <div className="text-center text-sm text-gray-600">Loading…</div>
                ) : (
                  <>
                    {(() => {
                      const today = new Date()
                      const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
                      const todaysCount = Array.isArray(analytics?.checkInTimes)
                        ? analytics.checkInTimes.filter(t => sameDay(new Date(t), today)).length
                        : 0
                      const total = analytics?.totalVisitors || 0
                      const verified = analytics?.verifiedVisitors || 0
                      if (todaysCount === 0 && total === 0) {
                        return (
                          <div className="text-center">
                            <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">No visitors yet today</p>
                            <p className="text-xs text-gray-500">Be the first to check in!</p>
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-2 text-sm text-gray-700">
                          <div className="flex items-center justify-between">
                            <span>Today</span>
                            <span className="font-medium">{todaysCount}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Verified</span>
                            <span className="font-medium">{verified}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Total</span>
                            <span className="font-medium">{total}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
