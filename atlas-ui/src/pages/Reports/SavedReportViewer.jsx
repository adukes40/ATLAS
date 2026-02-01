import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../../context/AuthContext'
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  Loader2, Download, Search, X, Check, Save, Copy,
  Columns3, GripVertical, AlertTriangle, FolderPlus
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers (shared with CustomBuilder)
// ---------------------------------------------------------------------------

const PLATFORM_MAP = {
  iiq_assets: 'iiq', iiq_users: 'iiq',
  google_devices: 'google',
  meraki_devices: 'meraki', meraki_networks: 'meraki',
}

const getPlatformColor = (source) => {
  const platform = PLATFORM_MAP[source]
  try {
    const stored = localStorage.getItem('atlas_platform_colors')
    const colors = stored ? JSON.parse(stored) : {}
    const defaults = { iiq: 'blue', google: 'emerald', meraki: 'purple' }
    return colors[platform] || defaults[platform] || 'blue'
  } catch { return 'blue' }
}

const DOT_COLORS = {
  blue: 'bg-blue-500', emerald: 'bg-emerald-500', purple: 'bg-purple-500',
  amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500',
}

const dotClass = (source) => DOT_COLORS[getPlatformColor(source)] || 'bg-blue-500'

// ---------------------------------------------------------------------------
// Save As Modal
// ---------------------------------------------------------------------------

function SaveAsModal({ onSave, onCancel, saving, defaultName }) {
  const [name, setName] = useState(defaultName ? `${defaultName} (copy)` : '')
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [loadingFolders, setLoadingFolders] = useState(true)

  useEffect(() => {
    axios.get('/api/reports/saved/folders/list')
      .then(res => setFolders(res.data || []))
      .catch(() => {})
      .finally(() => setLoadingFolders(false))
  }, [])

  const handleSave = () => {
    if (!name.trim()) return
    const folder = selectedFolder === '__new__' ? newFolderName.trim() || null : selectedFolder || null
    onSave({ name: name.trim(), folder })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Save Report As</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Report Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My Custom Report"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Folder</label>
            {loadingFolders ? (
              <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : (
              <select
                value={selectedFolder}
                onChange={e => setSelectedFolder(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {folders.map(f => <option key={f} value={f}>{f}</option>)}
                <option value="__new__">+ New Folder</option>
              </select>
            )}
          </div>

          {selectedFolder === '__new__' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Folder Name</label>
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column Picker Panel
// ---------------------------------------------------------------------------

function ColumnPickerPanel({ activeColumns, setActiveColumns, allSources, onClose }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [collapsedSections, setCollapsedSections] = useState({})
  const panelRef = useRef(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleDragStart = (index) => setDragIndex(index)
  const handleDragOver = (e, index) => {
    e.preventDefault()
    setDragOverIndex(index)
  }
  const handleDrop = (index) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newCols = [...activeColumns]
    const [moved] = newCols.splice(dragIndex, 1)
    newCols.splice(index, 0, moved)
    setActiveColumns(newCols)
    setDragIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const removeColumn = (col) => {
    setActiveColumns(prev => prev.filter(c => !(c.source === col.source && c.field === col.field)))
  }

  const addColumn = (source, col) => {
    const exists = activeColumns.some(c => c.source === source && c.field === col.key)
    if (exists) return
    setActiveColumns(prev => [...prev, { source, field: col.key, label: col.label, type: col.type }])
  }

  const isColumnActive = (source, key) => activeColumns.some(c => c.source === source && c.field === key)

  const toggleSection = (key) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-slate-800 shadow-xl z-50 flex flex-col border-l border-slate-200 dark:border-slate-700"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Columns</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Drag to reorder. Check/uncheck to show/hide.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Active Columns — draggable list */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Active Columns ({activeColumns.length})
            </h4>
            {activeColumns.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No columns selected</p>
            ) : (
              <div className="space-y-1">
                {activeColumns.map((col, index) => (
                  <div
                    key={`${col.source}__${col.field}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      dragOverIndex === index ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700' : 'bg-slate-50 dark:bg-slate-700/50 border border-transparent'
                    } ${dragIndex === index ? 'opacity-50' : ''}`}
                  >
                    <GripVertical className="h-4 w-4 text-slate-400 cursor-grab flex-shrink-0" />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(col.source)}`} />
                    <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{col.label}</span>
                    <button
                      onClick={() => removeColumn(col)}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 flex-shrink-0"
                    >
                      <X className="h-3 w-3 text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Columns — grouped by source */}
          <div className="px-4 py-3">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Available Columns
            </h4>
            <div className="space-y-2">
              {Object.entries(allSources).map(([sourceKey, src]) => {
                const collapsed = collapsedSections[sourceKey]
                return (
                  <div key={sourceKey}>
                    <button
                      onClick={() => toggleSection(sourceKey)}
                      className="w-full flex items-center justify-between py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dotClass(sourceKey)}`} />
                        <span>{src.label}</span>
                      </div>
                      {collapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      }
                    </button>
                    {!collapsed && (
                      <div className="ml-4 space-y-0.5">
                        {src.columns.map(col => {
                          const active = isColumnActive(sourceKey, col.key)
                          return (
                            <button
                              key={col.key}
                              onClick={() => active ? removeColumn({ source: sourceKey, field: col.key }) : addColumn(sourceKey, col)}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                                active
                                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                active ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-500'
                              }`}>
                                {active && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <span className="truncate">{col.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SavedReportViewer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Report metadata
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(true)
  const [reportError, setReportError] = useState(null)

  // Active columns (session state, may differ from saved config)
  const [activeColumns, setActiveColumns] = useState([])
  const [filters, setFilters] = useState([])
  const [sortRules, setSortRules] = useState([])

  // Query results
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  // Column picker
  const [showColumnPicker, setShowColumnPicker] = useState(false)
  const [allSources, setAllSources] = useState({})

  // Save state
  const [showSaveAsModal, setShowSaveAsModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch saved report config
  useEffect(() => {
    setLoadingReport(true)
    setReportError(null)
    axios.get(`/api/reports/saved/${id}`)
      .then(res => {
        setReport(res.data)
        const cfg = res.data.config || {}
        setActiveColumns(cfg.columns || [])
        setFilters(cfg.filters || [])
        setSortRules(cfg.sort || [])
      })
      .catch(err => {
        if (err.response?.status === 404) {
          setReportError('Report not found.')
        } else {
          setReportError('Failed to load report.')
        }
      })
      .finally(() => setLoadingReport(false))
  }, [id])

  // Fetch all available columns (for column picker)
  useEffect(() => {
    axios.get('/api/reports/custom/columns')
      .then(res => setAllSources(res.data.sources || {}))
      .catch(() => {})
  }, [])

  // Run query
  const fetchData = useCallback(async () => {
    if (activeColumns.length === 0) return
    setLoading(true)
    try {
      const body = {
        columns: activeColumns.map(c => ({ source: c.source, field: c.field })),
        filters,
        sort: sortRules,
        page,
        limit: 25,
        search,
      }
      const res = await axios.post('/api/reports/custom/query', body)
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.pages || 0)
    } catch (err) {
      console.error('Failed to fetch query:', err)
    } finally {
      setLoading(false)
    }
  }, [activeColumns, filters, sortRules, page, search])

  // Auto-fetch when config or pagination changes
  useEffect(() => {
    if (!loadingReport && !reportError && activeColumns.length > 0) {
      fetchData()
    }
  }, [fetchData, loadingReport, reportError])

  // ---------------------------------------------------------------------------
  // Sort helpers
  // ---------------------------------------------------------------------------

  const handleSort = (colKey, shiftKey) => {
    const parts = colKey.split('__')
    const source = parts[0]
    const field = parts.slice(1).join('__')
    const existing = sortRules.findIndex(s => s.source === source && s.field === field)

    if (shiftKey) {
      if (existing >= 0) {
        const rule = sortRules[existing]
        if (rule.direction === 'asc') {
          const updated = [...sortRules]
          updated[existing] = { ...rule, direction: 'desc' }
          setSortRules(updated)
        } else {
          setSortRules(sortRules.filter((_, i) => i !== existing))
        }
      } else {
        setSortRules([...sortRules, { source, field, direction: 'asc' }])
      }
    } else {
      if (existing >= 0 && sortRules.length === 1) {
        const rule = sortRules[0]
        if (rule.direction === 'asc') {
          setSortRules([{ source, field, direction: 'desc' }])
        } else {
          setSortRules([])
        }
      } else {
        setSortRules([{ source, field, direction: 'asc' }])
      }
    }
    setPage(1)
  }

  const getSortInfo = (colKey) => {
    const parts = colKey.split('__')
    const source = parts[0]
    const field = parts.slice(1).join('__')
    const idx = sortRules.findIndex(s => s.source === source && s.field === field)
    if (idx < 0) return null
    return { direction: sortRules[idx].direction, index: idx, total: sortRules.length }
  }

  // ---------------------------------------------------------------------------
  // Export CSV
  // ---------------------------------------------------------------------------

  const handleExportCSV = async () => {
    try {
      const body = {
        columns: activeColumns.map(c => ({ source: c.source, field: c.field })),
        filters,
        sort: sortRules,
        page: 1,
        limit: 50000,
        search,
      }
      const res = await axios.post('/api/reports/custom/query/export/csv', body, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${report?.name || 'report'}_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Save / Save As
  // ---------------------------------------------------------------------------

  const canSave = user?.role === 'admin' || user?.email === report?.created_by || user?.name === report?.created_by

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const config = {
        columns: activeColumns,
        filters,
        sort: sortRules,
      }
      await axios.put(`/api/reports/saved/${id}`, { name: report.name, folder: report.folder, config })
      window.dispatchEvent(new Event('atlas-saved-reports-changed'))
      setReport(prev => ({ ...prev, config }))
    } catch (err) {
      console.error('Failed to save report:', err)
      alert('Failed to save report. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAs = async ({ name, folder }) => {
    setSaving(true)
    try {
      const config = {
        columns: activeColumns,
        filters,
        sort: sortRules,
      }
      const res = await axios.post('/api/reports/saved', { name, folder, config })
      window.dispatchEvent(new Event('atlas-saved-reports-changed'))
      navigate(`/reports/saved/${res.data.id}`)
    } catch (err) {
      console.error('Failed to save report:', err)
      alert('Failed to save report. Please try again.')
    } finally {
      setSaving(false)
      setShowSaveAsModal(false)
    }
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  // Loading state
  if (loadingReport) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // Error state
  if (reportError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <p className="text-lg font-medium text-slate-600 dark:text-slate-400">{reportError}</p>
        <button
          onClick={() => navigate('/reports')}
          className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          Back to Reports
        </button>
      </div>
    )
  }

  // Column headers from active columns
  const colHeaders = activeColumns.map(c => ({
    key: `${c.source}__${c.field}`,
    source: c.source,
    label: c.label,
  }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{report.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Saved report by {report.created_by}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowColumnPicker(true)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </button>
          <button
            onClick={handleExportCSV}
            disabled={loading || data.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          {canSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          )}
          <button
            onClick={() => setShowSaveAsModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Copy className="h-4 w-4" />
            Save As
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search..."
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {loading ? (
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</span>
        ) : (
          <span>
            {total > 0
              ? `Showing ${(page - 1) * 25 + 1} - ${Math.min(page * 25, total)} of ${total.toLocaleString()} results`
              : 'No results found'
            }
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                {colHeaders.map(col => {
                  const sortInfo = getSortInfo(col.key)
                  return (
                    <th
                      key={col.key}
                      onClick={(e) => handleSort(col.key, e.shiftKey)}
                      className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(col.source)}`} />
                        {col.label}
                        {sortInfo && (
                          <span className="flex items-center">
                            {sortInfo.direction === 'asc'
                              ? <ChevronUp className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />
                            }
                            {sortInfo.total > 1 && (
                              <span className="text-xs text-blue-500 font-bold ml-0.5">{sortInfo.index + 1}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colHeaders.length || 1} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colHeaders.length || 1} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    No results found
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {colHeaders.map(col => (
                      <td key={col.key} className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {row[col.key] !== null && row[col.key] !== undefined ? String(row[col.key]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            {(() => {
              const pages = []
              const start = Math.max(1, page - 2)
              const end = Math.min(totalPages, page + 2)
              for (let i = start; i <= end; i++) {
                pages.push(
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    disabled={loading}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      i === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {i}
                  </button>
                )
              }
              return pages
            })()}
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Column Picker Panel */}
      {showColumnPicker && (
        <ColumnPickerPanel
          activeColumns={activeColumns}
          setActiveColumns={setActiveColumns}
          allSources={allSources}
          onClose={() => setShowColumnPicker(false)}
        />
      )}

      {/* Save As Modal */}
      {showSaveAsModal && (
        <SaveAsModal
          onSave={handleSaveAs}
          onCancel={() => setShowSaveAsModal(false)}
          saving={saving}
          defaultName={report?.name}
        />
      )}
    </div>
  )
}
