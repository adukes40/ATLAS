import { useState, useEffect } from 'react'
import axios from 'axios'
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export default function TablePreviewModal({ table, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)

  const pageSize = 100

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await axios.get(`/api/utilities/tables/${table.name}/preview`, {
          params: { page, page_size: pageSize }
        })
        setData(response.data)
      } catch (err) {
        console.error('Failed to fetch table preview:', err)
        setError('Failed to load table data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [table.name, page])

  const formatValue = (value, column) => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (column.includes('date') || column.includes('updated') || column.includes('sync') || column.includes('seen')) {
      try {
        const date = new Date(value)
        if (!isNaN(date)) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      } catch {
        // Fall through to return raw value
      }
    }
    return String(value)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-6xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {table.display_name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {table.rows?.toLocaleString()} total rows
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {data?.columns?.map((col) => (
                      <th
                        key={col}
                        className="text-left py-3 px-3 font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                      >
                        {col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.data?.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      {data?.columns?.map((col) => (
                        <td
                          key={col}
                          className="py-2 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-xs truncate"
                          title={formatValue(row[col], col)}
                        >
                          {formatValue(row[col], col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && (
          <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.total)} of {data.total?.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-300 min-w-[100px] text-center">
                Page {page + 1} of {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages - 1, p + 1))}
                disabled={page >= data.pages - 1}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
