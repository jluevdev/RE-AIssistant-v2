import React, { useState, useEffect } from 'react'
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Users, 
  Phone, 
  Mail, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  Download, 
  Share2,
  QrCode,
  BarChart3,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Building,
  DollarSign,
  Bed,
  Bath,
  Square,
  X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { httpsCallable } from 'firebase/functions'
import { collection, doc, getDocs, updateDoc, deleteDoc, query, where, orderBy, addDoc, onSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, functions, storage } from '../../config/firebase'
import toast from 'react-hot-toast'
import { Button, PageHeader } from '../../components/ui'
import LoadingSpinner from '../../components/LoadingSpinner'
import SkeletonLoader from '../../components/SkeletonLoader'
import OpenHouseAnalytics from './OpenHouseAnalytics'
import AutomatedFollowUp from './AutomatedFollowUpStub'
import { QRCodeSVG } from 'qrcode.react'

export default function OpenHouseManager() {
  const { currentUser, userProfile } = useAuth()
  const [openHouses, setOpenHouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showVisitorModal, setShowVisitorModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedOpenHouse, setSelectedOpenHouse] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // overview, analytics, followup
  const [newOpenHouse, setNewOpenHouse] = useState({
    title: '',
    address: '',
    date: '',
    startTime: '',
    endTime: '',
    description: '',
    propertyDetails: {
      price: '',
      beds: '',
      baths: '',
      sqft: '',
      type: 'Single Family',
      yearBuilt: '',
      features: []
    },
    photos: [],
    agentNotes: '',
    status: 'Scheduled'
  })

  void auth

  // Load open houses from Firebase with real-time visitor counts
  useEffect(() => {
    if (currentUser) {
      loadOpenHouses()
      
      // Set up real-time listener for open houses
      const openHousesRef = collection(db, 'openHouses')
      const q = query(openHousesRef, where('agentId', '==', currentUser.uid), orderBy('date', 'desc'))
      
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const openHousesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        // Fetch real-time visitor counts for each open house
        const openHousesWithVisitors = await Promise.all(
          openHousesData.map(async (openHouse) => {
            try {
              const visitorsRef = collection(db, 'openHouseVisitors')
              const visitorsQuery = query(visitorsRef, where('openHouseId', '==', openHouse.id))
              const visitorsSnapshot = await getDocs(visitorsQuery)
              
              const visitorCount = visitorsSnapshot.size
              const interestedVisitors = visitorsSnapshot.docs.filter(doc => {
                const data = doc.data()
                return data.interestLevel === 'Interested' || data.interestLevel === 'Very Interested'
              }).length
              
              return {
                ...openHouse,
                visitorCount,
                interestedVisitors,
                lastVisitorUpdate: new Date()
              }
            } catch (error) {
              console.error(`Error fetching visitors for open house ${openHouse.id}:`, error)
              return {
                ...openHouse,
                visitorCount: 0,
                interestedVisitors: 0,
                lastVisitorUpdate: new Date()
              }
            }
          })
        )
        
        setOpenHouses(openHousesWithVisitors)
      })
      
      return () => unsubscribe()
    }
  }, [currentUser])

  // Check for upcoming open houses and send reminders
  useEffect(() => {
    if (openHouses.length > 0) {
      const checkUpcomingOpenHouses = () => {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowString = tomorrow.toISOString().split('T')[0]
        
        const upcomingOpenHouses = openHouses.filter(openHouse => 
          openHouse.date === tomorrowString && 
          openHouse.status === 'Scheduled' &&
          !openHouse.reminderSent
        )
        
        upcomingOpenHouses.forEach(async (openHouse) => {
          try {
            await handleSendReminder(openHouse)
            // Mark reminder as sent
            await updateDoc(doc(db, 'openHouses', openHouse.id), {
              reminderSent: true,
              reminderSentAt: new Date()
            })
          } catch (error) {
            console.error('Error sending automatic reminder:', error)
          }
        })
      }
      
      // Check every hour
      const interval = setInterval(checkUpcomingOpenHouses, 60 * 60 * 1000)
      
      // Initial check
      checkUpcomingOpenHouses()
      
      return () => clearInterval(interval)
    }
  }, [openHouses])

  const loadOpenHouses = async () => {
    try {
      setLoading(true)
      const openHousesRef = collection(db, 'openHouses')
      const q = query(openHousesRef, where('agentId', '==', currentUser.uid), orderBy('date', 'desc'))
      const snapshot = await getDocs(q)
      
      const openHousesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      // Fetch real-time visitor counts for each open house
      const openHousesWithVisitors = await Promise.all(
        openHousesData.map(async (openHouse) => {
          try {
            const visitorsRef = collection(db, 'openHouseVisitors')
            const visitorsQuery = query(visitorsRef, where('openHouseId', '==', openHouse.id))
            const visitorsSnapshot = await getDocs(visitorsQuery)
            
            const visitorCount = visitorsSnapshot.size
            const interestedVisitors = visitorsSnapshot.docs.filter(doc => {
              const data = doc.data()
              return data.interestLevel === 'Interested' || data.interestLevel === 'Very Interested'
            }).length
            
            return {
              ...openHouse,
              visitorCount,
              interestedVisitors,
              lastVisitorUpdate: new Date()
            }
          } catch (error) {
            console.error(`Error fetching visitors for open house ${openHouse.id}:`, error)
            return {
              ...openHouse,
              visitorCount: 0,
              interestedVisitors: 0,
              lastVisitorUpdate: new Date()
            }
          }
        })
      )
      
      setOpenHouses(openHousesWithVisitors)
    } catch (error) {
      console.error('Error loading open houses:', error)
      toast.error('Failed to load open houses')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOpenHouse = async () => {
    try {
      if (!newOpenHouse.title || !newOpenHouse.address || !newOpenHouse.date) {
        toast.error('Please fill in all required fields')
        return
      }

      const { photos: _photosToUpload, ...newOpenHouseWithoutFiles } = newOpenHouse
      const openHouseData = {
        ...newOpenHouseWithoutFiles,
        ownerUid: currentUser.uid,
        agentId: currentUser.uid,
        teamId: userProfile?.teamId || null,
        agentName: userProfile?.fullName || currentUser.displayName,
        agentEmail: currentUser.email,
        agentPhone: userProfile?.phone || '',
        createdAt: new Date(),
        photos: [],
        visitors: [],
        leads: [],
        status: 'Scheduled'
      }

      // Create open house in Firestore
      const docRef = await addDoc(collection(db, 'openHouses'), openHouseData)

      // If photos selected, upload to Storage and save URLs
      if (Array.isArray(_photosToUpload) && _photosToUpload.length > 0) {
        const urls = []
        for (const file of _photosToUpload) {
          if (file && file.name) {
            const objectRef = ref(storage, `openHouses/${docRef.id}/${file.name}`)
            await uploadBytes(objectRef, file)
            const url = await getDownloadURL(objectRef)
            urls.push(url)
          }
        }
        await updateDoc(docRef, { photos: urls })
      }
      
      try {
        const scheduleReminder = httpsCallable(functions, 'scheduleOpenHouseReminder')
        await scheduleReminder({ openHouseId: docRef.id })
      } catch (reminderError) {
        console.warn('Could not schedule reminder:', reminderError)
      }

      toast.success('Open house created successfully!')
      setShowCreateModal(false)
      setNewOpenHouse({
        title: '',
        address: '',
        date: '',
        startTime: '',
        endTime: '',
        description: '',
        propertyDetails: {
          price: '',
          beds: '',
          baths: '',
          sqft: '',
          type: 'Single Family',
          yearBuilt: '',
          features: []
        },
        photos: [],
        agentNotes: '',
        status: 'Scheduled'
      })
      loadOpenHouses()
    } catch (error) {
      console.error('Error creating open house:', error)
      toast.error('Failed to create open house')
    }
  }

  const handleDeleteOpenHouse = async (openHouseId) => {
    if (window.confirm('Are you sure you want to delete this open house?')) {
      try {
        await deleteDoc(doc(db, 'openHouses', openHouseId))
        toast.success('Open house deleted successfully!')
        loadOpenHouses()
      } catch (error) {
        console.error('Error deleting open house:', error)
        toast.error('Failed to delete open house')
      }
    }
  }

  const handleUpdateStatus = async (openHouseId, newStatus) => {
    try {
      await updateDoc(doc(db, 'openHouses', openHouseId), {
        status: newStatus,
        lastUpdated: new Date()
      })
      
      // Update local state
      setOpenHouses(prev => prev.map(oh => 
        oh.id === openHouseId ? { ...oh, status: newStatus } : oh
      ))
      
      toast.success(`Open house status updated to ${newStatus}`)
      
      // If activating, send notifications to interested visitors
      if (newStatus === 'Active') {
        // TODO: Implement notification system
        console.log('Sending notifications to interested visitors')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
    }
  }

  const getStatusActions = (openHouse) => {
    const actions = []
    
    switch (openHouse.status) {
      case 'Scheduled':
        actions.push(
          <button
            key="activate"
            onClick={() => handleUpdateStatus(openHouse.id, 'Active')}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
          >
            Activate
          </button>
        )
        break
      case 'Active':
        actions.push(
          <button
            key="complete"
            onClick={() => handleUpdateStatus(openHouse.id, 'Completed')}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            Complete
          </button>
        )
        break
      case 'Completed':
        actions.push(
          <button
            key="reopen"
            onClick={() => handleUpdateStatus(openHouse.id, 'Scheduled')}
            className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700"
          >
            Reopen
          </button>
        )
        break
    }
    
    if (openHouse.status !== 'Cancelled') {
      actions.push(
        <button
          key="cancel"
          onClick={() => handleUpdateStatus(openHouse.id, 'Cancelled')}
          className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
        >
          Cancel
        </button>
      )
    }
    
    return actions
  }

  const handleEditOpenHouse = async () => {
    try {
      if (!selectedOpenHouse.title || !selectedOpenHouse.address || !selectedOpenHouse.date) {
        toast.error('Please fill in all required fields')
        return
      }

      // Strip any File objects from photos before saving
      const { photos: selectedPhotos, ...restSelected } = selectedOpenHouse
      const sanitizedPhotos = (selectedPhotos || []).filter((p) => typeof p === 'string')

      const ohRef = doc(db, 'openHouses', selectedOpenHouse.id)
      await updateDoc(ohRef, {
        ...restSelected,
        photos: sanitizedPhotos,
        updatedAt: new Date()
      })

      // Upload any newly attached File objects and append URLs
      const newFiles = (selectedPhotos || []).filter((p) => p && typeof p !== 'string')
      if (newFiles.length > 0) {
        const uploaded = []
        for (const file of newFiles) {
          const objectRef = ref(storage, `openHouses/${selectedOpenHouse.id}/${file.name}`)
          await uploadBytes(objectRef, file)
          uploaded.push(await getDownloadURL(objectRef))
        }
        await updateDoc(ohRef, { photos: [...sanitizedPhotos, ...uploaded] })
      }
      
      toast.success('Open house updated successfully!')
      setShowEditModal(false)
      setSelectedOpenHouse(null)
      loadOpenHouses()
    } catch (error) {
      console.error('Error updating open house:', error)
      toast.error('Failed to update open house')
    }
  }

  const handleSendReminder = async (openHouse) => {
    try {
      const scheduleReminder = httpsCallable(functions, 'scheduleOpenHouseReminder')
      await scheduleReminder({ openHouseId: openHouse.id })
      toast.success('Reminder scheduled (SMS sent ~1 hour before start)')
    } catch (error) {
      console.error('Error scheduling reminder:', error)
      toast.error('Failed to schedule reminder')
    }
  }

  const generateVisitorPortal = (openHouse) => {
    const portalUrl = `${window.location.origin}/checkin/${openHouse.id}`
    return portalUrl
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Scheduled': return 'bg-blue-100 text-blue-800'
      case 'Active': return 'bg-green-100 text-green-800'
      case 'Completed': return 'bg-gray-100 text-gray-800'
      case 'Cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Calendar}
          title="Open House Manager"
          subtitle="Manage your open houses and track visitor leads"
          backTo="/dashboard"
          backLabel="Dashboard"
        />
        <SkeletonLoader type="card" lines={3} />
        <SkeletonLoader type="card" lines={2} />
        <SkeletonLoader type="card" lines={1} />
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6">
        {/* Header */}
        <PageHeader
          icon={Calendar}
          title="Open House Manager"
          subtitle="Manage your open houses and track visitor leads"
          backTo="/dashboard"
          backLabel="Dashboard"
          actions={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4" />
              Create Open House
            </Button>
          }
        />

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('followup')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'followup'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Follow-up Sequences
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center">
                  <Calendar className="w-8 h-8 text-blue-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">Total Open Houses</p>
                    <p className="text-2xl font-bold text-gray-900">{openHouses.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center">
                  <Users className="w-8 h-8 text-green-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">Total Visitors</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {openHouses.reduce((total, oh) => total + (oh.visitorCount || 0), 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last updated: {openHouses.length > 0 && openHouses[0].lastVisitorUpdate ? 
                        new Date(openHouses[0].lastVisitorUpdate).toLocaleTimeString() : 'Never'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-purple-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">Active Today</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {openHouses.filter(oh => {
                        const today = new Date().toDateString()
                        const ohDate = new Date(oh.date).toDateString()
                        return ohDate === today && oh.status === 'Active'
                      }).length}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center">
                  <MessageSquare className="w-8 h-8 text-orange-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">New Leads</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {openHouses.reduce((total, oh) => total + (oh.interestedVisitors || 0), 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Based on visitor interest levels
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Open Houses List */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">Your Open Houses</h2>
              </div>
              
              {openHouses.length === 0 ? (
                <div className="p-8 text-center">
                  <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No open houses yet</h3>
                  <p className="text-gray-600 mb-4">Create your first open house to start tracking visitors and generating leads.</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                  >
                    Create Open House
                  </button>
                </div>
              ) : (
                <div className="divide-y">
                  {openHouses.map((openHouse) => (
                    <div key={openHouse.id} className="p-6">
                      <div className="flex flex-col lg:flex-row justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{openHouse.title}</h3>
                              <p className="text-gray-600">{openHouse.address}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(openHouse.status)}`}>
                              {openHouse.status}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="flex items-center text-sm text-gray-600">
                              <Calendar className="w-4 h-4 mr-2" />
                              {formatDate(openHouse.date)}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <Clock className="w-4 h-4 mr-2" />
                              {openHouse.startTime} - {openHouse.endTime}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <Users className="w-4 h-4 mr-2" />
                              {openHouse.visitorCount || 0} visitors
                              {openHouse.interestedVisitors > 0 && (
                                <span className="ml-2 text-green-600">
                                  ({openHouse.interestedVisitors} interested)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <MessageSquare className="w-4 h-4 mr-2" />
                              {openHouse.interestedVisitors || 0} leads
                            </div>
                          </div>
                          
                          {openHouse.propertyDetails && (
                            <div className="bg-gray-50 p-3 rounded-lg mb-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                {openHouse.propertyDetails.price && (
                                  <div className="flex items-center">
                                    <DollarSign className="w-4 h-4 mr-1 text-green-600" />
                                    {openHouse.propertyDetails.price}
                                  </div>
                                )}
                                {openHouse.propertyDetails.beds && (
                                  <div className="flex items-center">
                                    <Bed className="w-4 h-4 mr-1 text-blue-600" />
                                    {openHouse.propertyDetails.beds} beds
                                  </div>
                                )}
                                {openHouse.propertyDetails.baths && (
                                  <div className="flex items-center">
                                    <Bath className="w-4 h-4 mr-1 text-blue-600" />
                                    {openHouse.propertyDetails.baths} baths
                                  </div>
                                )}
                                {openHouse.propertyDetails.sqft && (
                                  <div className="flex items-center">
                                    <Square className="w-4 h-4 mr-1 text-purple-600" />
                                    {openHouse.propertyDetails.sqft} sqft
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          {openHouse.photos && openHouse.photos.length > 0 && (
                            <div className="mt-3">
                              <h4 className="text-xs font-medium text-gray-700 mb-2">Photos ({openHouse.photos.length})</h4>
                              <div className="flex gap-2 overflow-x-auto">
                                {openHouse.photos.slice(0, 3).map((photo, index) => (
                                  <div key={index} className="flex-shrink-0">
                                    <img
                                      src={typeof photo === 'string' ? photo : URL.createObjectURL(photo)}
                                      alt={`Property photo ${index + 1}`}
                                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                    />
                                  </div>
                                ))}
                                {openHouse.photos.length > 3 && (
                                  <div className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                                    <span className="text-xs text-gray-500">+{openHouse.photos.length - 3}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          {/* Status Action Buttons */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {getStatusActions(openHouse)}
                          </div>
                          
                          {/* Current Status Display */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Status:</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(openHouse.status)}`}>
                              {openHouse.status}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedOpenHouse(openHouse)
                              setShowVisitorModal(true)
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            View Details
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOpenHouse(openHouse)
                              setShowEditModal(true)
                            }}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              const portalUrl = generateVisitorPortal(openHouse)
                              navigator.clipboard.writeText(portalUrl)
                              toast.success('Visitor portal link copied to clipboard!')
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <Share2 className="w-4 h-4" />
                            Copy Portal Link
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOpenHouse(openHouse)
                              setShowQRModal(true)
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <QrCode className="w-4 h-4" />
                            Show QR Code
                          </button>
                          <button
                            onClick={() => handleSendReminder(openHouse)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Send Reminder
                          </button>
                          <button
                            onClick={() => handleDeleteOpenHouse(openHouse.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Open House Analytics</h2>
              <p className="text-gray-600">Analytics features coming soon. This will include visitor trends, conversion rates, and performance metrics.</p>
            </div>
          </div>
        )}

                {activeTab === 'followup' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Follow-up Sequences</h2>
              <p className="text-gray-600">Automated follow-up sequences coming soon. This will help you nurture leads and increase conversion rates.</p>
            </div>
          </div>
        )}
      </div>

      {/* Create Open House Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Create New Open House</h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Open House Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newOpenHouse.title}
                    onChange={(e) => setNewOpenHouse(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Beautiful Family Home Open House"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newOpenHouse.date}
                    onChange={(e) => setNewOpenHouse(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={newOpenHouse.startTime}
                    onChange={(e) => setNewOpenHouse(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={newOpenHouse.endTime}
                    onChange={(e) => setNewOpenHouse(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newOpenHouse.address}
                  onChange={(e) => setNewOpenHouse(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123 Main St, City, State ZIP"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newOpenHouse.description}
                  onChange={(e) => setNewOpenHouse(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the open house and any special features..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Photos</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files)
                      setNewOpenHouse(prev => ({ ...prev, photos: files }))
                    }}
                    className="hidden"
                    id="photo-upload"
                  />
                  <label htmlFor="photo-upload" className="cursor-pointer">
                    <div className="text-gray-600">
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-2 text-sm">Click to upload photos</p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB each</p>
                    </div>
                  </label>
                </div>
                {newOpenHouse.photos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm text-gray-600 mb-2">Selected photos: {newOpenHouse.photos.length}</p>
                    <div className="flex flex-wrap gap-2">
                      {newOpenHouse.photos.map((photo, index) => (
                        <div key={index} className="relative">
                          <img
                            src={URL.createObjectURL(photo)}
                            alt={`Property photo ${index + 1}`}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => {
                              setNewOpenHouse(prev => ({
                                ...prev,
                                photos: prev.photos.filter((_, i) => i !== index)
                              }))
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input
                    type="text"
                    value={newOpenHouse.propertyDetails.price}
                    onChange={(e) => setNewOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, price: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="$500,000"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                  <select
                    value={newOpenHouse.propertyDetails.type}
                    onChange={(e) => setNewOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, type: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Single Family">Single Family</option>
                    <option value="Condo">Condo</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Multi-Family">Multi-Family</option>
                    <option value="Land">Land</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                  <input
                    type="number"
                    value={newOpenHouse.propertyDetails.beds}
                    onChange={(e) => setNewOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, beds: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                  <input
                    type="number"
                    value={newOpenHouse.propertyDetails.baths}
                    onChange={(e) => setNewOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, baths: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Square Feet</label>
                  <input
                    type="number"
                    value={newOpenHouse.propertyDetails.sqft}
                    onChange={(e) => setNewOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, sqft: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="2000"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateOpenHouse}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Open House
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visitor Details Modal */}
      {showVisitorModal && selectedOpenHouse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{selectedOpenHouse.title}</h2>
                  <p className="text-gray-600">{selectedOpenHouse.address}</p>
                </div>
                <button
                  onClick={() => setShowVisitorModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Open House Details */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Open House Details</h3>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm">
                      <Calendar className="w-4 h-4 mr-3 text-gray-500" />
                      <span className="text-gray-600">Date:</span>
                      <span className="ml-2 font-medium">{formatDate(selectedOpenHouse.date)}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Clock className="w-4 h-4 mr-3 text-gray-500" />
                      <span className="text-gray-600">Time:</span>
                      <span className="ml-2 font-medium">{selectedOpenHouse.startTime} - {selectedOpenHouse.endTime}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <MapPin className="w-4 h-4 mr-3 text-gray-500" />
                      <span className="text-gray-600">Address:</span>
                      <span className="ml-2 font-medium">{selectedOpenHouse.address}</span>
                    </div>
                  </div>
                  
                  {selectedOpenHouse.description && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                      <p className="text-sm text-gray-600">{selectedOpenHouse.description}</p>
                    </div>
                  )}
                  
                  {selectedOpenHouse.photos && selectedOpenHouse.photos.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Property Photos</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedOpenHouse.photos.map((photo, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={typeof photo === 'string' ? photo : URL.createObjectURL(photo)}
                              alt={`Property photo ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                // Open photo in full screen
                                window.open(typeof photo === 'string' ? photo : URL.createObjectURL(photo), '_blank')
                              }}
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Visitor Portal</h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={generateVisitorPortal(selectedOpenHouse)}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                      />
                      <button
                        onClick={() => {
                          const portalUrl = generateVisitorPortal(selectedOpenHouse)
                          navigator.clipboard.writeText(portalUrl)
                          toast.success('Portal link copied!')
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Share this link with potential visitors for easy check-in
                    </p>
                  </div>
                </div>
                
                {/* Visitors & Leads */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Visitors & Leads</h3>
                  
                  {selectedOpenHouse.visitors && selectedOpenHouse.visitors.length > 0 ? (
                    <div className="space-y-3">
                      {selectedOpenHouse.visitors.map((visitor, index) => (
                        <div key={index} className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{visitor.name}</p>
                              <p className="text-sm text-gray-600">{visitor.phone}</p>
                              {visitor.email && <p className="text-sm text-gray-600">{visitor.email}</p>}
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(visitor.checkInTime).toLocaleTimeString()}
                            </span>
                          </div>
                          {visitor.notes && (
                            <p className="text-sm text-gray-600 mt-2">{visitor.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No visitors yet</p>
                      <p className="text-sm text-gray-500">Share the portal link to start collecting visitor information</p>
                    </div>
                  )}
                  
                  {selectedOpenHouse.leads && selectedOpenHouse.leads.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Qualified Leads</h4>
                      <div className="space-y-2">
                        {selectedOpenHouse.leads.map((lead, index) => (
                          <div key={index} className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-green-900">{lead.name}</p>
                                <p className="text-sm text-green-700">{lead.phone}</p>
                                <p className="text-sm text-green-700">{lead.interestLevel}</p>
                              </div>
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && selectedOpenHouse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">QR Code</h2>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="text-center">
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <QRCodeSVG 
                  value={generateVisitorPortal(selectedOpenHouse)}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Scan this QR code to access the open house portal
              </p>
              
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={generateVisitorPortal(selectedOpenHouse)}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                />
                <button
                  onClick={() => {
                    const portalUrl = generateVisitorPortal(selectedOpenHouse)
                    navigator.clipboard.writeText(portalUrl)
                    toast.success('Portal link copied!')
                  }}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Open House Modal */}
      {showEditModal && selectedOpenHouse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Edit Open House</h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Open House Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={selectedOpenHouse.title}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Beautiful Family Home Open House"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={selectedOpenHouse.date}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={selectedOpenHouse.startTime}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={selectedOpenHouse.endTime}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={selectedOpenHouse.address}
                  onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123 Main St, City, State ZIP"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={selectedOpenHouse.description}
                  onChange={(e) => setSelectedOpenHouse(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the open house and any special features..."
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input
                    type="text"
                    value={selectedOpenHouse.propertyDetails?.price || ''}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, price: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="$500,000"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                  <select
                    value={selectedOpenHouse.propertyDetails?.type || 'Single Family'}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, type: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Single Family">Single Family</option>
                    <option value="Condo">Condo</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Multi-Family">Multi-Family</option>
                    <option value="Land">Land</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                  <input
                    type="number"
                    value={selectedOpenHouse.propertyDetails?.beds || ''}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, beds: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                  <input
                    type="number"
                    value={selectedOpenHouse.propertyDetails?.baths || ''}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, baths: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="2"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Square Feet</label>
                  <input
                    type="number"
                    value={selectedOpenHouse.propertyDetails?.sqft || ''}
                    onChange={(e) => setSelectedOpenHouse(prev => ({ 
                      ...prev, 
                      propertyDetails: { ...prev.propertyDetails, sqft: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="2000"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditOpenHouse}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Update Open House
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
