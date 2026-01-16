import { useState, useCallback } from 'react'
import { Cpu, ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight, Download, ChevronsDown, ChevronsUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import axios from 'axios'

const MAX_DEVICES = 25

// Helper to format relative time
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function BulkDeviceLookup() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState([]) // Array of {query, status, data, error}
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [expandedRows, setExpandedRows] = useState(new Set())

  const queries = input.split('\n').map(q => q.trim()).filter(q => q.length > 0)

  const handleLookup = useCallback(async () => {
    if (queries.length === 0 || queries.length > MAX_DEVICES) return

    setLoading(true)
    setResults([])
    setExpandedRows(new Set())
    setProgress({ current: 0, total: queries.length })

    // Initialize results array with loading status
    const initialResults = queries.map(q => ({
      query: q,
      status: 'loading',
      data: null,
      error: null
    }))
    setResults(initialResults)

    // Process each query sequentially (not in parallel to avoid overwhelming API)
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]

      try {
        const res = await axios.get(`/api/device/${encodeURIComponent(query)}`)

        setResults(prev => {
          const updated = [...prev]
          updated[i] = {
            query,
            status: 'success',
            data: res.data,
            error: null
          }
          return updated
        })
      } catch (err) {
        setResults(prev => {
          const updated = [...prev]
          if (err.response?.status === 404) {
            updated[i] = {
              query,
              status: 'not_found',
              data: null,
              error: 'Device not found'
            }
          } else {
            updated[i] = {
              query,
              status: 'error',
              data: null,
              error: err.response?.data?.detail || err.message
            }
          }
          return updated
        })
      }

      setProgress({ current: i + 1, total: queries.length })
    }

    setLoading(false)
  }, [queries])

  const toggleRow = (index) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const expandAll = () => {
    const successIndexes = results
      .map((r, i) => r.status === 'success' ? i : -1)
      .filter(i => i !== -1)
    setExpandedRows(new Set(successIndexes))
  }

  const collapseAll = () => {
    setExpandedRows(new Set())
  }

  const handleExportCsv = () => {
    const headers = ['Query', 'Serial', 'Asset Tag', 'Model', 'IIQ Status', 'Google Status', 'Assigned User', 'Location']
    const rows = results.map(r => {
      if (r.status !== 'success') {
        return [r.query, '', '', '', r.status === 'not_found' ? 'Not Found' : 'Error', '', '', '']
      }
      const d = r.data
      const iiq = d?.sources?.iiq
      const google = d?.sources?.google
      return [
        r.query,
        d?.serial || '',
        iiq?.tag || '',
        iiq?.model || '',
        iiq?.status || '',
        google?.status || '',
        d?.identity?.assigned_user || '',
        iiq?.location || ''
      ]
    })

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bulk-device-lookup-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const completedCount = results.filter(r => r.status !== 'loading').length
  const successCount = results.filter(r => r.status === 'success').length
  const notFoundCount = results.filter(r => r.status === 'not_found').length
  const errorCount = results.filter(r => r.status === 'error').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/utilities"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Utilities
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Cpu className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Bulk Device Lookup
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Look up multiple devices at once by serial or asset tag
            </p>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Paste serial numbers or asset tags (one per line)
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="5CG1234ABC&#10;5CG5678DEF&#10;AT-12345&#10;..."
          rows={6}
          disabled={loading}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-sm disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-3">
          <span className={`text-sm ${queries.length > MAX_DEVICES ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {queries.length} device{queries.length !== 1 ? 's' : ''} entered
            {queries.length > MAX_DEVICES && ` (max ${MAX_DEVICES})`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setInput('')}
              disabled={loading}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={handleLookup}
              disabled={loading || queries.length === 0 || queries.length > MAX_DEVICES}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4" />
                  Lookup
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          {/* Progress Bar */}
          {loading && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mb-1">
                <span>Looking up devices...</span>
                <span>{progress.current} of {progress.total}</span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary & Actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-100">{completedCount}</span> / {results.length} complete
              </span>
              {successCount > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  <span className="font-medium">{successCount}</span> found
                </span>
              )}
              {notFoundCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  <span className="font-medium">{notFoundCount}</span> not found
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  <span className="font-medium">{errorCount}</span> errors
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={expandAll}
                disabled={successCount === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
              >
                <ChevronsDown className="h-3 w-3" />
                Expand All
              </button>
              <button
                onClick={collapseAll}
                disabled={expandedRows.size === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
              >
                <ChevronsUp className="h-3 w-3" />
                Collapse All
              </button>
              <button
                onClick={handleExportCsv}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <th className="w-8"></th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Query</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Serial</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Asset Tag</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">User</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Location</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <ResultRow
                    key={idx}
                    result={result}
                    index={idx}
                    expanded={expandedRows.has(idx)}
                    onToggle={() => toggleRow(idx)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({ result, index, expanded, onToggle }) {
  const { query, status, data, error } = result

  // Extract data from the correct paths
  const iiq = data?.sources?.iiq
  const google = data?.sources?.google
  const meraki = data?.sources?.meraki
  const serial = data?.serial
  const assignedUser = data?.identity?.assigned_user

  // Status icon
  const StatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />
      case 'not_found':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  // Get IIQ status color
  const getStatusColor = (iiqStatus) => {
    if (!iiqStatus) return 'text-slate-400'
    const s = iiqStatus.toLowerCase()
    if (s.includes('broken') || s.includes('damaged')) return 'text-red-600 dark:text-red-400'
    if (s.includes('storage') || s.includes('loaner')) return 'text-amber-600 dark:text-amber-400'
    if (s.includes('service') || s.includes('deployed')) return 'text-emerald-600 dark:text-emerald-400'
    return 'text-slate-600 dark:text-slate-400'
  }

  return (
    <>
      {/* Main Row */}
      <tr
        className={`border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 ${
          status === 'success' ? 'cursor-pointer' : ''
        }`}
        onClick={status === 'success' ? onToggle : undefined}
      >
        <td className="py-2 px-2 text-center">
          <StatusIcon />
        </td>
        <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400 text-xs">
          {query}
        </td>
        <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-100">
          {serial || '-'}
        </td>
        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
          {iiq?.tag || '-'}
        </td>
        <td className="py-2 px-3">
          {status === 'success' ? (
            <span className={getStatusColor(iiq?.status)}>
              {iiq?.status || '-'}
            </span>
          ) : status === 'not_found' ? (
            <span className="text-amber-600 dark:text-amber-400">Not Found</span>
          ) : status === 'error' ? (
            <span className="text-red-600 dark:text-red-400">Error</span>
          ) : (
            <span className="text-slate-400">Loading...</span>
          )}
        </td>
        <td className="py-2 px-3 text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
          {assignedUser && assignedUser !== 'Unassigned' ? assignedUser : '-'}
        </td>
        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
          {iiq?.location || '-'}
        </td>
        <td className="py-2 px-2 text-center">
          {status === 'success' && (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )
          )}
        </td>
      </tr>

      {/* Expanded Details */}
      {expanded && status === 'success' && data && (
        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b-4 border-slate-300 dark:border-slate-600">
          <td colSpan={8} className="p-4">
            <ExpandedDetails data={data} />
          </td>
        </tr>
      )}
    </>
  )
}

function ExpandedDetails({ data }) {
  const iiq = data?.sources?.iiq
  const google = data?.sources?.google
  const meraki = data?.sources?.meraki
  const assignedUser = data?.identity?.assigned_user

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
      {/* IIQ Info */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
          IIQ Info
        </h4>
        {iiq ? (
          <>
            <DetailRow label="Model" value={iiq.model} />
            <DetailRow label="Status" value={iiq.status} />
            <DetailRow label="Asset Tag" value={iiq.tag} />
            <DetailRow label="Owner" value={assignedUser !== 'Unassigned' ? assignedUser : null} />
            <DetailRow label="Email" value={iiq.assigned_user_email} />
            <DetailRow label="Grade" value={iiq.assigned_grade} />
            <DetailRow label="Homeroom" value={iiq.assigned_homeroom} />
            <DetailRow label="Location" value={iiq.location} />
            <DetailRow label="Owner Location" value={iiq.owner_location} />
            <DetailRow label="Tickets" value={iiq.ticket_count} />
            <DetailRow label="Fee Balance" value={iiq.fee_balance ? `$${iiq.fee_balance.toFixed(2)}` : null} />
          </>
        ) : (
          <p className="text-slate-400 dark:text-slate-500 text-xs">No IIQ data</p>
        )}
      </div>

      {/* Google Info */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
          Google Info
        </h4>
        {google ? (
          <>
            <DetailRow label="Status" value={google.status} />
            <DetailRow label="OS" value={google.os_version} />
            <DetailRow label="AUE" value={google.aue_date} />
            <DetailRow label="Battery" value={google.battery_health ? `${google.battery_health}%` : null} />
            <DetailRow label="OU" value={google.org_unit_path} />
            <DetailRow label="Last Sync" value={google.last_sync ? formatRelativeTime(google.last_sync) : null} />
            <DetailRow label="LAN IP" value={google.lan_ip} />
            <DetailRow label="WAN IP" value={google.wan_ip} />
          </>
        ) : (
          <p className="text-slate-400 dark:text-slate-500 text-xs">No Google data</p>
        )}
      </div>

      {/* Meraki Info */}
      <div className="space-y-2">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
          Network (Meraki)
        </h4>
        {meraki ? (
          <>
            <DetailRow label="Last AP" value={meraki.ap_name} />
            <DetailRow label="SSID" value={meraki.ssid} />
            <DetailRow label="Last Seen" value={meraki.last_seen ? formatRelativeTime(meraki.last_seen) : null} />
            <DetailRow label="IP" value={meraki.ip_address} />
            <DetailRow label="MAC" value={meraki.mac_address} />
          </>
        ) : (
          <p className="text-slate-400 dark:text-slate-500 text-xs">No network data</p>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-medium text-right break-words min-w-0">
        {value || '-'}
      </span>
    </div>
  )
}
