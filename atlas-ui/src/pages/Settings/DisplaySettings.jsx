import { useState, useEffect, useRef } from 'react'
import { Monitor, Clock, Globe, Check, Palette } from 'lucide-react'
import axios from 'axios'

// Common US timezones
const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'UTC', label: 'UTC' },
]

export default function DisplaySettings() {
  const [timezone, setTimezone] = useState(() =>
    localStorage.getItem('atlas_timezone') || 'America/New_York'
  )
  const [timeFormat, setTimeFormat] = useState(() =>
    localStorage.getItem('atlas_time_format') || '12'
  )
  const [showVendorColors, setShowVendorColors] = useState(() =>
    localStorage.getItem('atlas_vendor_colors') !== 'false'
  )
  const [saved, setSaved] = useState(false)
  const initialMount = useRef(true)

  // Load schedule_timezone from backend on mount
  useEffect(() => {
    const loadBackendTimezone = async () => {
      try {
        const res = await axios.get('/api/settings')
        if (res.data?.schedule_timezone) {
          // Backend has a timezone set - sync it to localStorage
          localStorage.setItem('atlas_timezone', res.data.schedule_timezone)
          setTimezone(res.data.schedule_timezone)
        }
      } catch (err) {
        // Ignore errors - use localStorage value
      }
    }
    loadBackendTimezone()
  }, [])

  // Save to localStorage and backend when changed
  useEffect(() => {
    localStorage.setItem('atlas_timezone', timezone)
    localStorage.setItem('atlas_time_format', timeFormat)
    localStorage.setItem('atlas_vendor_colors', showVendorColors)

    // Dispatch custom event so other components can react
    window.dispatchEvent(new CustomEvent('atlas-settings-changed', {
      detail: { timezone, timeFormat, showVendorColors }
    }))

    // Also save timezone to backend for scheduler (skip on initial mount)
    if (!initialMount.current) {
      axios.post('/api/settings', {
        settings: { schedule_timezone: timezone }
      }).catch(() => {
        // Ignore errors - localStorage is the primary source
      })
    }
    initialMount.current = false

    setSaved(true)
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [timezone, timeFormat, showVendorColors])

  // Format current time as preview
  const formatPreview = () => {
    const now = new Date()
    const options = {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: timeFormat === '12'
    }
    return now.toLocaleTimeString('en-US', options)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Monitor className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Display Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Configure time display preferences
          </p>
        </div>
        {saved && (
          <div className="ml-auto flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm">
            <Check className="h-4 w-4" />
            Saved
          </div>
        )}
      </div>

      {/* Timezone Setting */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start gap-3 mb-4">
          <Globe className="h-5 w-5 text-slate-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">
              Timezone
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              All times will be displayed in this timezone
            </p>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full max-w-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Time Format Setting */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start gap-3 mb-4">
          <Clock className="h-5 w-5 text-slate-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">
              Time Format
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Choose between 12-hour or 24-hour time display
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setTimeFormat('12')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  timeFormat === '12'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                12-hour (3:30 PM)
              </button>
              <button
                onClick={() => setTimeFormat('24')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  timeFormat === '24'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                24-hour (15:30)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Colors Setting */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start gap-3">
          <Palette className="h-5 w-5 text-slate-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">
              Vendor Colors
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Show colored borders to indicate data source
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowVendorColors(!showVendorColors)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showVendorColors ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showVendorColors ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 text-slate-600 dark:text-slate-300">IIQ</span>
                <span className="px-2 py-1 rounded border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-slate-600 dark:text-slate-300">Google</span>
                <span className="px-2 py-1 rounded border-l-4 border-l-purple-500 bg-purple-50 dark:bg-purple-900/20 text-slate-600 dark:text-slate-300">Meraki</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-2">
          Preview
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Current time in your selected format:
        </p>
        <div className="text-2xl font-mono text-slate-800 dark:text-slate-100">
          {formatPreview()}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {TIMEZONES.find(t => t.value === timezone)?.label}
        </p>
      </div>
    </div>
  )
}
