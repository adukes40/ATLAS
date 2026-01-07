import { useState, useEffect } from 'react'
import { Monitor, Clock, Globe, Check } from 'lucide-react'

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
  const [saved, setSaved] = useState(false)

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('atlas_timezone', timezone)
    localStorage.setItem('atlas_time_format', timeFormat)

    // Dispatch custom event so other components can react
    window.dispatchEvent(new CustomEvent('atlas-settings-changed', {
      detail: { timezone, timeFormat }
    }))

    setSaved(true)
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [timezone, timeFormat])

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
