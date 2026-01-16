import { useState, useEffect } from 'react'
import { Search, ArrowLeft, Copy, ExternalLink, Loader2, CheckCircle, XCircle, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import axios from 'axios'

export default function MacAddressLookup() {
  const [mode, setMode] = useState('single') // 'single' or 'bulk'
  const [singleMac, setSingleMac] = useState('')
  const [bulkMacs, setBulkMacs] = useState('')
  const [singleResult, setSingleResult] = useState(null)
  const [bulkResults, setBulkResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState(null)

  // Fetch OUI database stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/utilities/mac-lookup/stats')
        setStats(res.data)
      } catch (err) {
        // Silent fail
      }
    }
    fetchStats()
  }, [])

  const handleSingleLookup = async () => {
    if (!singleMac.trim()) return

    setLoading(true)
    setError(null)
    setSingleResult(null)

    try {
      const res = await axios.get(`/api/utilities/mac-lookup?mac=${encodeURIComponent(singleMac.trim())}`)
      setSingleResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkLookup = async () => {
    const macs = bulkMacs
      .split('\n')
      .map(m => m.trim())
      .filter(m => m.length > 0)

    if (macs.length === 0) return

    if (macs.length > 100) {
      setError('Maximum 100 MAC addresses per lookup')
      return
    }

    setLoading(true)
    setError(null)
    setBulkResults(null)

    try {
      const res = await axios.post('/api/utilities/mac-lookup/bulk', { macs })
      setBulkResults(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Bulk lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyVendor = (vendor) => {
    navigator.clipboard.writeText(vendor)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportCsv = () => {
    if (!bulkResults?.results) return

    const headers = ['MAC Address', 'OUI', 'Vendor', 'Found']
    const rows = bulkResults.results.map(r => [
      r.mac,
      r.oui || '',
      r.vendor,
      r.found ? 'Yes' : 'No'
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mac-lookup-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      action()
    }
  }

  const macCount = bulkMacs.split('\n').filter(m => m.trim()).length

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
          <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
            <Search className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              MAC Address Lookup
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Identify device vendor from MAC address
              {stats && (
                <span className="ml-2 text-xs">
                  ({stats.vendor_count?.toLocaleString()} vendors in database)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMode('single'); setError(null); }}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              mode === 'single'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            Single
          </button>
          <button
            onClick={() => { setMode('bulk'); setError(null); }}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              mode === 'bulk'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            Bulk
          </button>
        </div>

        {/* Single Mode */}
        {mode === 'single' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={singleMac}
                onChange={(e) => setSingleMac(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleSingleLookup)}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
              />
              <button
                onClick={handleSingleLookup}
                disabled={loading || !singleMac.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Lookup
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Accepts: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, or AABBCCDDEEFF
            </p>
          </div>
        )}

        {/* Bulk Mode */}
        {mode === 'bulk' && (
          <div className="space-y-4">
            <textarea
              value={bulkMacs}
              onChange={(e) => setBulkMacs(e.target.value)}
              placeholder="Paste MAC addresses (one per line)&#10;AA:BB:CC:DD:EE:FF&#10;11-22-33-44-55-66&#10;AABBCCDDEEFF"
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {macCount} MAC{macCount !== 1 ? 's' : ''} entered (max 100)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkMacs('')}
                  className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkLookup}
                  disabled={loading || macCount === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Lookup All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Single Result */}
      {mode === 'single' && singleResult && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">MAC Address</p>
                <p className="text-lg font-mono text-slate-800 dark:text-slate-100">{singleResult.mac}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                singleResult.found
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              }`}>
                {singleResult.found ? 'Found' : 'Unknown'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Vendor</p>
                <p className="text-base font-medium text-slate-800 dark:text-slate-100">{singleResult.vendor}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">OUI Prefix</p>
                <p className="text-base font-mono text-slate-800 dark:text-slate-100">{singleResult.oui}</p>
              </div>
            </div>

            {singleResult.address && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Address</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{singleResult.address}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => handleCopyVendor(singleResult.vendor)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Vendor'}
              </button>
              <Link
                to={`/?q=${singleResult.mac.replace(/:/g, '')}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Search in Device 360
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Results */}
      {mode === 'bulk' && bulkResults && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          {/* Summary */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-100">{bulkResults.total}</span> looked up
              </span>
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                <span className="font-medium">{bulkResults.found}</span> found
              </span>
              <span className="text-sm text-amber-600 dark:text-amber-400">
                <span className="font-medium">{bulkResults.unknown}</span> unknown
              </span>
              {bulkResults.errors > 0 && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  <span className="font-medium">{bulkResults.errors}</span> errors
                </span>
              )}
            </div>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">MAC Address</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">OUI</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Vendor</th>
                  <th className="text-center py-2 px-3 font-medium text-slate-600 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {bulkResults.results.map((result, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-100">{result.mac}</td>
                    <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">{result.oui || '-'}</td>
                    <td className="py-2 px-3 text-slate-800 dark:text-slate-100">{result.vendor}</td>
                    <td className="py-2 px-3 text-center">
                      {result.error ? (
                        <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                      ) : result.found ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <span className="text-amber-500">?</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
