import { useState, useEffect, useRef } from 'react'
import { Bell, X, AlertCircle, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/utilities/notifications')
      setNotifications(res.data.notifications || [])
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on mount and poll every 30 seconds
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Dismiss single notification
  const handleDismiss = async (id, e) => {
    e.stopPropagation()
    try {
      await axios.post(`/api/utilities/notifications/${id}/dismiss`)
      setNotifications(prev => prev.filter(n => n.id !== id))
    } catch (err) {
      console.error('Failed to dismiss notification:', err)
    }
  }

  // Dismiss all
  const handleDismissAll = async () => {
    try {
      await axios.post('/api/utilities/notifications/dismiss-all')
      setNotifications([])
      setIsOpen(false)
    } catch (err) {
      console.error('Failed to dismiss all notifications:', err)
    }
  }

  // Navigate to utilities page
  const handleViewDetails = (notification) => {
    setIsOpen(false)
    navigate('/utilities')
  }

  // Format time ago
  const formatTimeAgo = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString + 'Z')
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  const sourceNames = {
    iiq: 'IIQ',
    google: 'Google',
    meraki: 'Meraki'
  }

  const count = notifications.length

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all active:scale-95 ${
          count > 0
            ? 'text-red-500 hover:text-red-600'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
        title={count > 0 ? `${count} sync failure${count !== 1 ? 's' : ''}` : 'No notifications'}
      >
        <Bell className="h-4 w-4" />

        {/* Badge */}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              Sync Notifications
            </h3>
            {count > 0 && (
              <button
                onClick={handleDismissAll}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Dismiss All
              </button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-500 dark:text-slate-400">
                Loading...
              </div>
            ) : count === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No sync failures
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                  onClick={() => handleViewDetails(notif)}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      notif.status === 'error'
                        ? 'text-red-500'
                        : 'text-amber-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {sourceNames[notif.source] || notif.source} sync {notif.status}
                        </span>
                        <button
                          onClick={(e) => handleDismiss(notif.id, e)}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {notif.records_failed} record{notif.records_failed !== 1 ? 's' : ''} failed
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">
                          {formatTimeAgo(notif.created_at)}
                        </span>
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                          View details <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
