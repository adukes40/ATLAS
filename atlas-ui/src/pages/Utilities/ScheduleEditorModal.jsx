import { useState } from 'react'
import { X, Clock, Save } from 'lucide-react'

export default function ScheduleEditorModal({ source, schedule, onSave, onClose }) {
  const [selectedHours, setSelectedHours] = useState(new Set(schedule?.hours || []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const sourceNames = {
    iiq: 'Incident IQ',
    google: 'Google Admin',
    meraki: 'Meraki'
  }

  const toggleHour = (hour) => {
    const newHours = new Set(selectedHours)
    if (newHours.has(hour)) {
      newHours.delete(hour)
    } else {
      newHours.add(hour)
    }
    setSelectedHours(newHours)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(source, Array.from(selectedHours).sort((a, b) => a - b))
    } catch (err) {
      setError('Failed to save schedule')
      setSaving(false)
    }
  }

  const formatHour = (hour) => {
    if (hour === 0) return '12 AM'
    if (hour === 12) return '12 PM'
    if (hour < 12) return `${hour} AM`
    return `${hour - 12} PM`
  }

  // Generate 24 hours in a 6x4 grid
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Edit Schedule: {sourceNames[source] || source}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Click hours to toggle when syncs should run. Times shown in UTC.
          </p>

          {/* Hour Grid */}
          <div className="grid grid-cols-6 gap-2 mb-4">
            {hours.map((hour) => (
              <button
                key={hour}
                onClick={() => toggleHour(hour)}
                className={`py-2 px-1 text-xs font-medium rounded-lg transition-colors ${
                  selectedHours.has(hour)
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {formatHour(hour)}
              </button>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSelectedHours(new Set([2, 3, 4]))}
              className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Nightly (2-4 AM)
            </button>
            <button
              onClick={() => setSelectedHours(new Set([2, 8, 14, 20]))}
              className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Every 6 hours
            </button>
            <button
              onClick={() => setSelectedHours(new Set())}
              className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Clear All
            </button>
          </div>

          {/* Selected Summary */}
          <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {selectedHours.size === 0 ? (
              <span className="text-amber-600 dark:text-amber-400">
                No hours selected - sync will only run manually
              </span>
            ) : (
              <>
                <span className="font-medium">{selectedHours.size}</span> scheduled run{selectedHours.size !== 1 ? 's' : ''} per day:{' '}
                {Array.from(selectedHours).sort((a, b) => a - b).map(h => formatHour(h)).join(', ')}
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 mb-4">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Schedule
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
