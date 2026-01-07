import { useState, useEffect } from 'react'
import axios from 'axios'
import { X, Loader2, AlertCircle, ToggleRight } from 'lucide-react'

export default function IIQPreviewModal({ source, onClose, onToggle }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const res = await axios.get(`/api/settings/iiq-sources/${source.key}/preview`)
        setPreview(res.data)
        setError(null)
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load preview')
      } finally {
        setLoading(false)
      }
    }
    fetchPreview()
  }, [source.key])

  // Close on escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const renderValue = (value) => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 50) + '...'
    const str = String(value)
    return str.length > 50 ? str.slice(0, 50) + '...' : str
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-5xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {source.display_name} Preview
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {preview?.record_count?.toLocaleString() || '?'} total records • Showing 5 samples
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-500">
              <AlertCircle className="h-5 w-5 mr-2" />
              {error}
            </div>
          ) : preview?.sample_records?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {preview.fields.map((field) => (
                      <th
                        key={field}
                        className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                      >
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample_records.map((record, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      {preview.fields.map((field) => (
                        <td
                          key={field}
                          className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {renderValue(record[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              No records found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {source.enabled
              ? 'This source is currently syncing'
              : 'Enable to include in nightly sync'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Close
            </button>
            {!source.enabled && (
              <button
                onClick={onToggle}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <ToggleRight className="h-4 w-4" />
                Enable Sync
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
