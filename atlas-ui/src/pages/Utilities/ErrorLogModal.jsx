import { X, AlertTriangle, Clock, User } from 'lucide-react'

export default function ErrorLogModal({ log, onClose }) {
  if (!log) return null

  const errors = log.error_details || []

  // Format timestamp to EST
  const formatTimestamp = (iso) => {
    if (!iso) return '-'
    let dateStr = iso
    if (!iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-', 10)) {
      dateStr = iso + 'Z'
    }
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Sync Error Log
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {log.source.toUpperCase()} sync - {formatTimestamp(log.started_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Summary */}
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Records Processed: </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {log.records_processed?.toLocaleString() || 0}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Failed: </span>
              <span className="font-medium text-red-600 dark:text-red-400">
                {log.records_failed?.toLocaleString() || 0}
              </span>
            </div>
          </div>
          {log.error_message && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {log.error_message}
            </p>
          )}
        </div>

        {/* Error List */}
        <div className="flex-1 overflow-auto p-4">
          {errors.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No detailed error logs available for this sync.</p>
              <p className="text-xs mt-1">Error details are captured for syncs run after this feature was added.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {errors.map((error, index) => (
                <div
                  key={index}
                  className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {error.identifier}
                        </span>
                        {error.timestamp && (
                          <span className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(error.timestamp)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400 break-words">
                        {error.error}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
