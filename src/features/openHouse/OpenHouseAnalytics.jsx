import React, { useState, useEffect } from 'react'
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  Calendar, 
  CheckCircle, 
  Clock,
  Download,
  RefreshCw,
  Filter,
  Eye,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  User
} from 'lucide-react'
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function OpenHouseAnalytics() {
  const { currentUser } = useAuth()
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')
  const [selectedOpenHouse, setSelectedOpenHouse] = useState('all')
  const [openHouses, setOpenHouses] = useState([])
  const [visitorTrends, setVisitorTrends] = useState([])
  const [performanceMetrics, setPerformanceMetrics] = useState({})
  const [compareOpenHouses, setCompareOpenHouses] = useState([])
  const [compareMetric, setCompareMetric] = useState('visitors') // 'visitors' | 'interested' | 'conversion'

  const db = getFirestore()

  useEffect(() => {
    if (currentUser) {
      loadAnalytics()
      loadOpenHouses()
    }
  }, [currentUser, dateRange, selectedOpenHouse])

  const loadOpenHouses = async () => {
    try {
      const openHousesRef = collection(db, 'openHouses')
      const q = query(
        openHousesRef, 
        where('agentId', '==', currentUser.uid), 
        orderBy('date', 'desc')
      )
      const snapshot = await getDocs(q)
      
      const openHousesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      setOpenHouses(openHousesData)
    } catch (error) {
      console.error('Error loading open houses:', error)
    }
  }

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - parseInt(dateRange))
      
      const visitorsRef = collection(db, 'openHouseVisitors')
      let visitorsQuery = query(
        visitorsRef,
        where('agentId', '==', currentUser.uid),
        where('checkInTime', '>=', startDate),
        orderBy('checkInTime', 'desc')
      )
      
      if (selectedOpenHouse !== 'all') {
        visitorsQuery = query(
          visitorsQuery,
          where('openHouseId', '==', selectedOpenHouse)
        )
      }
      
      const visitorsSnapshot = await getDocs(visitorsQuery)
      const visitorsData = visitorsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      // Calculate comprehensive analytics
      const totalVisitors = visitorsData.length
      const uniqueVisitors = new Set(visitorsData.map(v => v.phone || v.email)).size
      const interestedVisitors = visitorsData.filter(v => 
        v.interestLevel === 'Interested' || v.interestLevel === 'Very Interested'
      ).length
      const conversionRate = totalVisitors > 0 ? (interestedVisitors / totalVisitors * 100).toFixed(1) : 0
      
      // Calculate visitor trends by day
      const trends = calculateVisitorTrends(visitorsData, startDate, endDate)
      
      // Calculate performance metrics
      const metrics = calculatePerformanceMetrics(visitorsData, openHouses)
      
      setAnalytics({
        totalVisitors,
        uniqueVisitors,
        interestedVisitors,
        conversionRate,
        visitorsData
      })
      
      setVisitorTrends(trends)
      setPerformanceMetrics(metrics)
      
    } catch (error) {
      console.error('Error loading analytics:', error)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const calculateVisitorTrends = (visitors, startDate, endDate) => {
    const trends = []
    const currentDate = new Date(startDate)
    
    while (currentDate <= endDate) {
      const dateString = currentDate.toISOString().split('T')[0]
      const dayVisitors = visitors.filter(v => {
        const visitorDate = new Date(v.checkInTime).toISOString().split('T')[0]
        return visitorDate === dateString
      })
      
      trends.push({
        date: dateString,
        visitors: dayVisitors.length
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return trends
  }

  const calculatePerformanceMetrics = (visitors, openHouses) => {
    // Calculate interest level distribution
    const interestDistribution = {}
    visitors.forEach(v => {
      const level = v.interestLevel || 'Unknown'
      interestDistribution[level] = (interestDistribution[level] || 0) + 1
    })
    
    // Calculate average follow-up time (mock data for now)
    const avgFollowUpTime = visitors.length > 0 ? Math.floor(Math.random() * 24) + 1 : 0
    
    // Calculate top performing open houses
    const openHousePerformance = {}
    visitors.forEach(v => {
      const openHouseId = v.openHouseId
      if (openHouseId) {
        if (!openHousePerformance[openHouseId]) {
          openHousePerformance[openHouseId] = { visitors: 0, interested: 0 }
        }
        openHousePerformance[openHouseId].visitors++
        if (v.interestLevel === 'Interested' || v.interestLevel === 'Very Interested') {
          openHousePerformance[openHouseId].interested++
        }
      }
    })
    
    return {
      interestDistribution,
      avgFollowUpTime,
      openHousePerformance
    }
  }

  // Initialize default comparison selection when metrics update
  useEffect(() => {
    if (!performanceMetrics?.openHousePerformance) return
    const entries = Object.entries(performanceMetrics.openHousePerformance)
    if (entries.length === 0) return
    // If no selection, pick top 3 by visitors
    if (compareOpenHouses.length === 0) {
      const defaults = entries
        .sort((a, b) => b[1].visitors - a[1].visitors)
        .slice(0, 3)
        .map(([id]) => id)
      setCompareOpenHouses(defaults)
    }
  }, [performanceMetrics])

  const buildComparisonData = () => {
    const perf = performanceMetrics?.openHousePerformance || {}
    return compareOpenHouses
      .filter((id) => perf[id])
      .map((id) => {
        const stats = perf[id]
        const oh = openHouses.find((o) => o.id === id)
        const conversion = stats.visitors > 0 ? Math.round((stats.interested / stats.visitors) * 100) : 0
        return {
          id,
          name: oh?.title || 'Open House',
          address: oh?.address || '',
          visitors: stats.visitors,
          interested: stats.interested,
          conversion
        }
      })
  }

  const exportAnalytics = () => {
    if (!analytics) return
    
    const csvContent = [
      ['Date', 'Total Visitors', 'Unique Visitors', 'Interested Visitors', 'Conversion Rate (%)'],
      ...visitorTrends.map(trend => [
        trend.date,
        trend.visitors,
        analytics.uniqueVisitors, // Use analytics.uniqueVisitors
        analytics.interestedVisitors,
        analytics.conversionRate
      ])
    ].map(row => row.join(',')).join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `open-house-analytics-${dateRange}-days.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    
    toast.success('Analytics exported successfully!')
  }

  const getInterestLevelColor = (level) => {
    switch (level) {
      case 'Very Interested': return 'text-green-600 bg-green-100'
      case 'Interested': return 'text-blue-600 bg-blue-100'
      case 'Somewhat Interested': return 'text-yellow-600 bg-yellow-100'
      case 'Not Interested': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Open House Analytics</h2>
          <p className="text-sm text-gray-600">Track visitor engagement and performance metrics</p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <select
            value={selectedOpenHouse}
            onChange={(e) => setSelectedOpenHouse(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Open Houses</option>
            {openHouses.map(oh => (
              <option key={oh.id} value={oh.id}>{oh.title}</option>
            ))}
          </select>
          <button
            onClick={loadAnalytics}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={exportAnalytics}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Visitors</p>
              <p className="text-2xl font-semibold text-gray-900">{analytics?.totalVisitors || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Interested Visitors</p>
              <p className="text-2xl font-semibold text-gray-900">{analytics?.interestedVisitors || 0}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{analytics?.conversionRate || 0}%</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Avg Follow-up Time</p>
              <p className="text-2xl font-semibold text-gray-900">{performanceMetrics?.avgFollowUpTime || 0}h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comparative Analytics */}
      {performanceMetrics?.openHousePerformance && Object.keys(performanceMetrics.openHousePerformance).length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Comparative Analytics</h3>
            <div className="flex items-center gap-2 mt-3 sm:mt-0">
              <select
                value={compareMetric}
                onChange={(e) => setCompareMetric(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="visitors">Total Visitors</option>
                <option value="interested">Interested Visitors</option>
                <option value="conversion">Conversion Rate</option>
              </select>
              <select
                multiple
                value={compareOpenHouses}
                onChange={(e) => setCompareOpenHouses(Array.from(e.target.selectedOptions).map(o => o.value))}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px] h-24"
                title="Hold Ctrl/Command to select multiple"
              >
                {openHouses.map(oh => (
                  <option key={oh.id} value={oh.id}>{oh.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Simple bar chart */}
          <div className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {buildComparisonData().map((item) => {
                const value = compareMetric === 'visitors' ? item.visitors : compareMetric === 'interested' ? item.interested : item.conversion
                // compute max for scale
                const data = buildComparisonData()
                const maxVal = Math.max(1, ...data.map(d => (compareMetric === 'conversion' ? d.conversion : compareMetric === 'interested' ? d.interested : d.visitors)))
                const height = Math.max(8, Math.round((value / maxVal) * 160))
                return (
                  <div key={item.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900 truncate max-w-[70%]" title={item.name}>{item.name}</div>
                      <div className="text-sm text-gray-600">{compareMetric === 'conversion' ? `${value}%` : value}</div>
                    </div>
                    <div className="h-48 flex items-end">
                      <div className="w-full bg-blue-100 rounded flex items-end">
                        <div
                          className="w-full bg-blue-500 rounded"
                          style={{ height: `${height}px` }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 truncate" title={item.address}>{item.address}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Visitor Trends Chart */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Visitor Trends</h3>
        <div className="h-64 flex items-end space-x-2">
          {visitorTrends.map((trend, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div 
                className="w-full bg-blue-500 rounded-t"
                style={{ 
                  height: `${Math.max(10, (trend.visitors / Math.max(...visitorTrends.map(t => t.visitors))) * 200)}px` 
                }}
              ></div>
              <div className="text-xs text-gray-500 mt-2 text-center">
                {new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="text-xs font-medium text-gray-900 mt-1">{trend.visitors}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Interest Level Distribution */}
      {performanceMetrics?.interestDistribution && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Interest Level Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(performanceMetrics.interestDistribution).map(([level, count]) => (
              <div key={level} className="text-center">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getInterestLevelColor(level)}`}>
                  {level}
                </div>
                <div className="text-2xl font-semibold text-gray-900 mt-2">{count}</div>
                <div className="text-sm text-gray-600">
                  {((count / analytics.totalVisitors) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Performing Open Houses */}
      {performanceMetrics?.openHousePerformance && Object.keys(performanceMetrics.openHousePerformance).length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Top Performing Open Houses</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(performanceMetrics.openHousePerformance)
              .sort((a, b) => b[1].visitors - a[1].visitors)
              .slice(0, 6)
              .map(([openHouseId, stats]) => {
                const oh = openHouses.find(o => o.id === openHouseId)
                const rate = stats.visitors > 0 ? Math.round((stats.interested / stats.visitors) * 100) : 0
                return (
                  <div key={openHouseId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-gray-900 truncate max-w-[70%]">{oh?.title || 'Open House'}</div>
                      <span className="text-xs text-gray-500">{new Date(oh?.date || Date.now()).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-gray-600 truncate mb-3">{oh?.address || '—'}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xl font-semibold text-gray-900">{stats.visitors}</div>
                        <div className="text-xs text-gray-500">Visitors</div>
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-gray-900">{stats.interested}</div>
                        <div className="text-xs text-gray-500">Interested</div>
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-gray-900">{rate}%</div>
                        <div className="text-xs text-gray-500">Conv. Rate</div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* Recent Visitors */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Visitors</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Open House</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interest</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analytics?.visitorsData?.slice(0, 10).map((visitor) => (
                <tr key={visitor.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <User className="w-5 h-5 text-gray-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{visitor.name}</div>
                        <div className="text-sm text-gray-500">{visitor.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {openHouses.find(oh => oh.id === visitor.openHouseId)?.title || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getInterestLevelColor(visitor.interestLevel)}`}>
                      {visitor.interestLevel || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(visitor.checkInTime).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      {visitor.phone && (
                        <a href={`tel:${visitor.phone}`} className="text-blue-600 hover:text-blue-800">
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      {visitor.email && (
                        <a href={`mailto:${visitor.email}`} className="text-blue-600 hover:text-blue-800">
                          <Mail className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
