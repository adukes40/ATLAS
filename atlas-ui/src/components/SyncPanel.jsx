import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  RefreshCw, CheckCircle, AlertCircle, Clock, Loader2,
  X, Calendar, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Database, ArrowRight, Settings, Palette, Check
} from 'lucide-react'

// Constants
const POLLING_INTERVAL_MS = 5000
const HISTORY_LIMIT = 10
const ERROR_DETAILS_LIMIT = 5

// Static mapping of API endpoints to database tables per service
const DATA_TABLES = {
  iiq: [
    { api: 'POST /api/v1.0/assets', table: 'iiq_assets' },
    { api: 'GET /api/v1.0/users', table: 'iiq_users' },
    { api: 'GET /api/v1.0/locations', table: 'location_cache' },
    { api: 'Computed from tickets', table: 'cached_stats' },
  ],
  google: [
    { api: 'directory.chromeosdevices.list', table: 'google_devices' },
    { api: 'directory.users.list', table: 'google_users' },
  ],
  meraki: [
    { api: 'GET /organizations/{org}/networks', table: 'meraki_networks' },
    { api: 'GET /organizations/{org}/devices', table: 'meraki_devices' },
    { api: 'GET /networks/{id}/wireless/ssids', table: 'meraki_ssids' },
    { api: 'GET /networks/{id}/clients', table: 'meraki_clients' },
  ],
}

// Service display configuration
const SERVICE_CONFIG = {
  iiq: {
    name: 'Incident IQ',
    color: 'blue',
    description: 'Assets, Users, Locations, Ticket Stats'
  },
  google: {
    name: 'Google Admin',
    color: 'emerald',
    description: 'Device Telemetry, Users'
  },
  meraki: {
    name: 'Meraki',
    color: 'purple',
    description: 'Networks, Devices, SSIDs, Clients'
  }
}

// Available colors for customization
const AVAILABLE_COLORS = {
  blue: {
    name: 'Blue',
    border: 'border-blue-200 dark:border-blue-800',
    bg: 'bg-blue-50/50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
    ring: 'ring-blue-400',
    button: 'bg-blue-600 hover:bg-blue-700',
  },
  emerald: {
    name: 'Emerald',
    border: 'border-emerald-200 dark:border-emerald-800',
    bg: 'bg-emerald-50/50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400',
    button: 'bg-emerald-600 hover:bg-emerald-700',
  },
  purple: {
    name: 'Purple',
    border: 'border-purple-200 dark:border-purple-800',
    bg: 'bg-purple-50/50 dark:bg-purple-900/20',
    text: 'text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    dot: 'bg-purple-500',
    ring: 'ring-purple-400',
    button: 'bg-purple-600 hover:bg-purple-700',
  },
  amber: {
    name: 'Amber',
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50/50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  rose: {
    name: 'Rose',
    border: 'border-rose-200 dark:border-rose-800',
    bg: 'bg-rose-50/50 dark:bg-rose-900/20',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
    ring: 'ring-rose-400',
    button: 'bg-rose-600 hover:bg-rose-700',
  },
  cyan: {
    name: 'Cyan',
    border: 'border-cyan-200 dark:border-cyan-800',
    bg: 'bg-cyan-50/50 dark:bg-cyan-900/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    badge: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    dot: 'bg-cyan-500',
    ring: 'ring-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-700',
  },
}

// Default colors for each service
const DEFAULT_COLORS = {
  iiq: 'blue',
  google: 'emerald',
  meraki: 'purple',
}

// Helper to get platform colors from localStorage
const getPlatformColor = (platform) => {
  try {
    const stored = localStorage.getItem('atlas_platform_colors')
    const colors = stored ? JSON.parse(stored) : {}
    return colors[platform] || DEFAULT_COLORS[platform] || 'blue'
  } catch {
    return DEFAULT_COLORS[platform] || 'blue'
  }
}

// Helper to save platform color
const savePlatformColor = (platform, color) => {
  try {
    const stored = localStorage.getItem('atlas_platform_colors')
    const colors = stored ? JSON.parse(stored) : {}
    colors[platform] = color
    localStorage.setItem('atlas_platform_colors', JSON.stringify(colors))
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('atlas-colors-changed', {
      detail: { platform, color, allColors: colors }
    }))
  } catch (e) {
    console.error('Failed to save platform color:', e)
  }
}

export default function SyncPanel({ service }) {
  const config = SERVICE_CONFIG[service] || { name: service, color: 'blue', description: '' }
  const dataTables = DATA_TABLES[service] || []

  // Color state - get from localStorage or use default
  const [selectedColor, setSelectedColor] = useState(() => getPlatformColor(service))
  const colors = AVAILABLE_COLORS[selectedColor] || AVAILABLE_COLORS.blue

  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef(null)

  // State
  const [syncStatus, setSyncStatus] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedErrorId, setExpandedErrorId] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Schedule editor modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedHours, setSelectedHours] = useState([])
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false)
      }
    }
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColorPicker])

  // Handle color selection
  const handleColorSelect = (color) => {
    setSelectedColor(color)
    savePlatformColor(service, color)
    setShowColorPicker(false)
  }

  // Refs
  const pollingRef = useRef(null)
  const mountedRef = useRef(true)

  // Get display settings from localStorage
  const getDisplaySettings = () => ({
    timezone: localStorage.getItem('atlas_timezone') || 'America/New_York',
    hour12: localStorage.getItem('atlas_time_format') !== '24'
  })

  // Fetch all data
  const fetchData = async () => {
    try {
      const [statusRes, schedulesRes, historyRes] = await Promise.all([
        axios.get('/api/utilities/sync-status'),
        axios.get('/api/utilities/schedules'),
        axios.get('/api/utilities/sync-history'),
      ])

      // Prevent state updates if component unmounted
      if (!mountedRef.current) return

      setSyncStatus(statusRes.data[service] || null)
      setSchedule(schedulesRes.data[service] || null)

      // Filter history for this service only
      const serviceHistory = (historyRes.data || [])
        .filter(h => h.source === service)
        .slice(0, HISTORY_LIMIT)
      setHistory(serviceHistory)

      // Check if sync is running
      const isRunning = statusRes.data[service]?.status === 'running'
      if (isRunning) {
        startPolling()
      } else {
        stopPolling()
      }
    } catch (err) {
      console.error('Failed to fetch sync data:', err)
      if (mountedRef.current) {
        setError('Failed to load sync data')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  // Start polling for sync status
  const startPolling = () => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(fetchData, POLLING_INTERVAL_MS)
  }

  // Stop polling
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Initial fetch and cleanup
  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [service])

  // Track elapsed time for running syncs
  useEffect(() => {
    if (syncStatus?.status !== 'running' || !syncStatus?.started_at) {
      setElapsedSeconds(0)
      return
    }

    let startStr = syncStatus.started_at
    if (!startStr.endsWith('Z') && !startStr.includes('+') && !startStr.includes('-', 10)) {
      startStr = startStr + 'Z'
    }
    const startTime = new Date(startStr).getTime()
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [syncStatus?.status, syncStatus?.started_at])

  // Handle sync trigger
  const handleSync = async () => {
    // Optimistic UI update
    setSyncStatus(prev => ({
      ...prev,
      status: 'running',
      started_at: new Date().toISOString()
    }))
    startPolling()

    try {
      await axios.post(`/api/utilities/sync/${service}`)
    } catch (err) {
      console.error(`Failed to trigger ${service} sync:`, err)
      const errorMsg = err.response?.data?.detail || `Failed to start ${service} sync`
      await fetchData()
      setError(errorMsg)
    }
  }

  // Handle cancel
  const handleCancel = async () => {
    try {
      await axios.post(`/api/utilities/sync/${service}/cancel`)
      await fetchData()
    } catch (err) {
      console.error(`Failed to cancel ${service} sync:`, err)
      const errorMsg = err.response?.data?.detail || `Failed to cancel ${service} sync`
      setError(errorMsg)
    }
  }

  // Handle toggle enabled
  const handleToggleEnabled = async () => {
    const newEnabled = !schedule?.enabled
    try {
      await axios.put(`/api/utilities/schedules/${service}`, { enabled: newEnabled })
      await fetchData()
    } catch (err) {
      console.error(`Failed to update ${service} schedule:`, err)
    }
  }

  // Open schedule editor modal
  const openScheduleModal = () => {
    setSelectedHours(schedule?.hours || [])
    setShowScheduleModal(true)
  }

  // Toggle hour selection
  const toggleHour = (hour) => {
    setSelectedHours(prev =>
      prev.includes(hour)
        ? prev.filter(h => h !== hour)
        : [...prev, hour].sort((a, b) => a - b)
    )
  }

  // Save schedule hours
  const saveScheduleHours = async () => {
    setSavingSchedule(true)
    try {
      await axios.put(`/api/utilities/schedules/${service}`, { hours: selectedHours })
      await fetchData()
      setShowScheduleModal(false)
    } catch (err) {
      console.error(`Failed to update ${service} schedule:`, err)
      setError('Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  // Format hour for display in modal (always show in user's format)
  const formatHourLabel = (hour) => {
    const { hour12 } = getDisplaySettings()
    if (hour12) {
      const period = hour >= 12 ? 'PM' : 'AM'
      const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      return `${h}${period}`
    }
    return `${hour.toString().padStart(2, '0')}:00`
  }

  // Format helpers
  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  const formatTimestamp = (iso) => {
    if (!iso) return '-'
    const { timezone, hour12 } = getDisplaySettings()
    let dateStr = iso
    if (!iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-', 10)) {
      dateStr = iso + 'Z'
    }
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()

    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12,
      timeZone: timezone
    })

    if (isToday) return `Today ${time}`
    if (isYesterday) return `Yesterday ${time}`
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timezone
    }) + ` ${time}`
  }

  const formatScheduleHours = (hours) => {
    if (!hours || hours.length === 0) return 'No hours set'
    const { hour12 } = getDisplaySettings()
    return hours.map(h => {
      if (hour12) {
        const period = h >= 12 ? 'PM' : 'AM'
        const hour12Val = h === 0 ? 12 : h > 12 ? h - 12 : h
        return `${hour12Val}${period}`
      } else {
        return `${h.toString().padStart(2, '0')}:00`
      }
    }).join(', ')
  }

  // Status helpers
  const getStatusIcon = () => {
    if (!syncStatus) return <Clock className="h-5 w-5 text-slate-400" />

    switch (syncStatus.status) {
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />
      case 'partial':
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'cancelled':
        return <X className="h-5 w-5 text-slate-500" />
      default:
        return <Clock className="h-5 w-5 text-slate-400" />
    }
  }

  const getStatusText = () => {
    if (!syncStatus) return 'Unknown'

    switch (syncStatus.status) {
      case 'running':
        return 'Syncing...'
      case 'success':
        return 'Synced'
      case 'partial':
        return 'Partial'
      case 'error':
        return 'Failed'
      case 'cancelled':
        return 'Cancelled'
      case 'never':
        return 'Never synced'
      default:
        return syncStatus.status
    }
  }

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
      case 'partial':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      case 'cancelled':
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
      case 'running':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
    }
  }

  const getTimeAgo = () => {
    if (!syncStatus?.completed_at && !syncStatus?.started_at) return null

    const timestamp = syncStatus.completed_at || syncStatus.started_at
    let dateStr = timestamp
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
      dateStr = timestamp + 'Z'
    }
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const isRunning = syncStatus?.status === 'running'
  const isEnabled = schedule?.enabled !== false

  if (loading) {
    return (
      <div className={`rounded-xl border-2 p-6 ${colors.border} ${colors.bg}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border-2 ${colors.border} ${colors.bg}`}>
      {/* Header Section */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <RefreshCw className={`h-5 w-5 ${colors.text}`} />
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                Data Sync
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {config.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {/* Color Picker */}
            <div className="relative" ref={colorPickerRef}>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center`}
                title="Change color"
              >
                <span className={`w-5 h-5 rounded-full ${colors.dot} block`} />
              </button>
              {showColorPicker && (
                <div className="absolute right-0 top-8 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 z-20">
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(AVAILABLE_COLORS).map(([key, colorOption]) => (
                      <button
                        key={key}
                        onClick={() => handleColorSelect(key)}
                        className={`w-9 h-9 rounded-full ${colorOption.dot} flex items-center justify-center transition-all ${
                          selectedColor === key
                            ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ' + colorOption.ring
                            : 'hover:scale-110'
                        }`}
                        title={colorOption.name}
                      >
                        {selectedColor === key && (
                          <Check className="h-4 w-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={openScheduleModal}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Edit schedule"
            >
              <Settings className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
            </button>
            <button
              onClick={handleToggleEnabled}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              title={isEnabled ? 'Disable scheduled syncs' : 'Enable scheduled syncs'}
            >
              {isEnabled ? (
                <ToggleRight className="h-6 w-6 text-emerald-500" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Schedule Display */}
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {!isEnabled ? (
            <span className="text-slate-400 dark:text-slate-500 italic">Scheduling disabled (manual only)</span>
          ) : schedule?.hours?.length > 0 ? (
            <span>{formatScheduleHours(schedule.hours)}</span>
          ) : (
            <span className="text-amber-500">No hours scheduled</span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-medium ${
            syncStatus?.status === 'error' ? 'text-red-600 dark:text-red-400' :
            syncStatus?.status === 'partial' ? 'text-amber-600 dark:text-amber-400' :
            syncStatus?.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
            syncStatus?.status === 'running' ? 'text-blue-600 dark:text-blue-400' :
            'text-slate-600 dark:text-slate-400'
          }`}>
            {getStatusText()}
          </span>
          {getTimeAgo() && !isRunning && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {getTimeAgo()}
            </span>
          )}
        </div>

        {/* Running Progress Bar */}
        {isRunning && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>{formatDuration(elapsedSeconds)} elapsed</span>
              {schedule?.avg_duration_seconds ? (
                <span>
                  ETA: ~{formatDuration(Math.max(0, schedule.avg_duration_seconds - elapsedSeconds))}
                </span>
              ) : (
                <span className="italic">estimating...</span>
              )}
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  schedule?.avg_duration_seconds && elapsedSeconds > schedule.avg_duration_seconds
                    ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{
                  width: schedule?.avg_duration_seconds
                    ? `${Math.min(100, (elapsedSeconds / schedule.avg_duration_seconds) * 100)}%`
                    : '100%',
                  animation: schedule?.avg_duration_seconds ? 'none' : 'pulse 2s infinite'
                }}
              />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs mb-4">
          <div className="text-slate-500 dark:text-slate-400">
            <span className="block text-slate-400 dark:text-slate-500">Records</span>
            {syncStatus?.records_processed?.toLocaleString() || '-'}
          </div>
          <div className="text-slate-500 dark:text-slate-400">
            <span className="block text-slate-400 dark:text-slate-500">Avg Duration</span>
            {formatDuration(schedule?.avg_duration_seconds) || '-'}
          </div>
          <div className="text-slate-500 dark:text-slate-400">
            <span className="block text-slate-400 dark:text-slate-500">Schedule</span>
            {schedule?.hours?.length || 0}x daily
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isRunning ? (
            <button
              onClick={handleCancel}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleSync}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </button>
          )}
        </div>
      </div>

      {/* History Section */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-700">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Recent Sync History
        </h4>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
            No sync history available. Run a sync to see history here.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Duration</th>
                  <th className="pb-2 font-medium">Records</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((log) => (
                  <>
                    <tr key={log.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-2 text-slate-600 dark:text-slate-300">
                        {formatTimestamp(log.started_at)}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">
                        {formatDuration(log.duration_seconds)}
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">
                        {log.records_processed?.toLocaleString() || '-'}
                        {log.records_failed > 0 && (
                          <button
                            onClick={() => setExpandedErrorId(expandedErrorId === log.id ? null : log.id)}
                            className="text-red-500 hover:text-red-600 dark:hover:text-red-400 ml-1 inline-flex items-center gap-0.5"
                            title="Click to view error details"
                          >
                            ({log.records_failed} failed)
                            {expandedErrorId === log.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusBadgeClass(log.status)}`}>
                          {log.status === 'running' && (
                            <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                          )}
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                    {/* Expandable Error Details */}
                    {expandedErrorId === log.id && log.records_failed > 0 && (
                      <tr key={`${log.id}-errors`}>
                        <td colSpan={4} className="py-2">
                          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                            {log.error_message && (
                              <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                                {log.error_message}
                              </p>
                            )}
                            {log.error_details && log.error_details.length > 0 ? (
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {log.error_details.slice(0, ERROR_DETAILS_LIMIT).map((err, idx) => (
                                  <div key={idx} className="text-xs">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                      {err.identifier}:
                                    </span>
                                    <span className="text-red-600 dark:text-red-400 ml-1">
                                      {err.error}
                                    </span>
                                  </div>
                                ))}
                                {log.error_details.length > ERROR_DETAILS_LIMIT && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                                    ... and {log.error_details.length - ERROR_DETAILS_LIMIT} more errors
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                                No detailed error information available.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Tables Section */}
      <div className="p-5">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          Data Tables
        </h4>
        <div className="space-y-2">
          {dataTables.map((mapping, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
            >
              <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-700 dark:text-slate-300 flex-shrink-0">
                {mapping.api}
              </code>
              <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <div className="flex items-center gap-1">
                <Database className="h-3 w-3 text-slate-400" />
                <span className="font-medium">{mapping.table}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-5 mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Schedule Editor Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className={`px-5 py-4 border-b border-slate-200 dark:border-slate-700 ${colors.bg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className={`h-5 w-5 ${colors.text}`} />
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                      Schedule {config.name} Sync
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Select hours when sync should run automatically
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Hour Grid */}
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {selectedHours.length} hour{selectedHours.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedHours([])}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Clear all
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    onClick={() => setSelectedHours([...Array(24).keys()])}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Select all
                  </button>
                </div>
              </div>

              {/* AM Hours */}
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">AM</p>
                <div className="grid grid-cols-6 gap-2">
                  {[...Array(12).keys()].map(hour => (
                    <button
                      key={hour}
                      onClick={() => toggleHour(hour)}
                      className={`py-2 px-1 rounded-lg text-sm font-medium transition-all ${
                        selectedHours.includes(hour)
                          ? `${colors.badge} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800 ${colors.ring}`
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {formatHourLabel(hour)}
                    </button>
                  ))}
                </div>
              </div>

              {/* PM Hours */}
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">PM</p>
                <div className="grid grid-cols-6 gap-2">
                  {[...Array(12).keys()].map(i => {
                    const hour = i + 12
                    return (
                      <button
                        key={hour}
                        onClick={() => toggleHour(hour)}
                        className={`py-2 px-1 rounded-lg text-sm font-medium transition-all ${
                          selectedHours.includes(hour)
                            ? `${colors.badge} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800 ${colors.ring}`
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {formatHourLabel(hour)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveScheduleHours}
                disabled={savingSchedule}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${colors.button}`}
              >
                {savingSchedule ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save Schedule'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
