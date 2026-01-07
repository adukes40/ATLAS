import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Database, RefreshCw, Eye, Check, X, Loader2,
  AlertCircle, Clock, ToggleLeft, ToggleRight
} from 'lucide-react'
import IIQPreviewModal from './IIQPreviewModal'

export default function IIQSourcesCard() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [previewSource, setPreviewSource] = useState(null)
  const [error, setError] = useState(null)

  const fetchSources = async () => {
    try {
      const res = await axios.get('/api/settings/iiq-sources')
      setSources(res.data.sources)
      setError(null)
    } catch (err) {
      setError('Failed to load IIQ sources')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSources()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await axios.post('/api/settings/iiq-sources/refresh-counts')
      await fetchSources()
    } catch (err) {
      setError('Failed to refresh counts')
    } finally {
      setRefreshing(false)
    }
  }

  const handleToggle = async (sourceKey) => {
    setToggling(sourceKey)
    try {
      await axios.post(`/api/settings/iiq-sources/${sourceKey}/toggle`)
      await fetchSources()
    } catch (err) {
      setError(`Failed to toggle ${sourceKey}`)
    } finally {
      setToggling(null)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              IIQ Data Sources
            </h2>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh record counts"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Sources List */}
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.key}
              className={`p-4 rounded-lg border-2 transition-colors ${
                source.enabled
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-800 dark:text-slate-100">
                      {source.display_name}
                    </h3>
                    {source.enabled ? (
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full">
                        Syncing
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">
                        Not syncing
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                    <span>
                      {source.record_count?.toLocaleString() || '?'} records
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {source.enabled ? formatDate(source.last_synced) : 'Never synced'}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">
                      Table: {source.sync_table}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewSource(source)}
                    className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    title="Preview data"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleToggle(source.key)}
                    disabled={toggling === source.key}
                    className="p-1 transition-colors disabled:opacity-50"
                    title={source.enabled ? 'Disable sync' : 'Enable sync'}
                  >
                    {toggling === source.key ? (
                      <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                    ) : source.enabled ? (
                      <ToggleRight className="h-6 w-6 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Enabled sources sync during nightly jobs. Toggle to add or remove data sources.
        </p>
      </div>

      {/* Preview Modal */}
      {previewSource && (
        <IIQPreviewModal
          source={previewSource}
          onClose={() => setPreviewSource(null)}
          onToggle={() => {
            handleToggle(previewSource.key)
            setPreviewSource(null)
          }}
        />
      )}
    </>
  )
}
