import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Columns3, Download, Save, Copy, RotateCcw, Loader2,
  Search, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Filter, Check, FolderPlus, AlertTriangle, Plus, ListFilter
} from 'lucide-react'
import useUnifiedReport from '../../hooks/useUnifiedReport'
import ColumnPickerPanel from '../../components/ColumnPickerPanel'
import DateRangePicker from '../../components/DateRangePicker'
// BulkActionBar and ActionPanel temporarily disabled
// import BulkActionBar from '../../components/BulkActionBar'
// import ActionPanel from '../../components/ActionPanel'

// Platform color mapping
const PLATFORM_MAP = {
  iiq_assets: 'iiq', iiq_users: 'iiq', iiq_tickets: 'iiq',
  google_devices: 'google', google_users: 'google',
  meraki_devices: 'meraki', meraki_networks: 'meraki',
  meraki_clients: 'meraki', network_cache: 'meraki',
}

const DOT_COLORS = {
  iiq: 'bg-blue-500', google: 'bg-emerald-500', meraki: 'bg-purple-500',
}

const getDotColor = (source) => DOT_COLORS[PLATFORM_MAP[source]] || 'bg-slate-400'

// ─── Dynamic Filter Dropdown ──────────────────────────────────────────────────

function DynamicFilterDropdown({ source, field, label, value, onChange, fetchOptions }) {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const dropdownRef = useRef(null)

  const selectedValues = value?.values || []
  const isExclude = value?.exclude || false

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleOpen = async () => {
    setIsOpen(!isOpen)
    if (!isOpen && options.length === 0) {
      setOptionsLoading(true)
      const opts = await fetchOptions(source, field)
      setOptions(opts)
      setOptionsLoading(false)
    }
  }

  const toggleOption = (opt) => {
    let newValues
    if (selectedValues.includes(opt)) {
      newValues = selectedValues.filter(v => v !== opt)
    } else {
      newValues = [...selectedValues, opt]
    }
    if (newValues.length === 0) {
      onChange(null)
    } else {
      onChange({ values: newValues, exclude: isExclude })
    }
  }

  const toggleExclude = (e) => {
    e.stopPropagation()
    if (selectedValues.length > 0) {
      onChange({ values: selectedValues, exclude: !isExclude })
    }
  }

  const clearSelection = (e) => {
    e.stopPropagation()
    onChange(null)
  }

  const displayText = selectedValues.length === 0
    ? 'All'
    : selectedValues.length === 1
      ? (isExclude ? `Not: ${selectedValues[0]}` : selectedValues[0])
      : `${isExclude ? 'Exclude ' : ''}${selectedValues.length} selected`

  return (
    <div className="flex flex-col gap-1 relative flex-shrink-0" ref={dropdownRef}>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide truncate">
        {label}
      </label>
      <button
        type="button"
        onClick={handleOpen}
        className={`h-9 px-2.5 rounded-lg border bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm flex items-center justify-between gap-1 min-w-[140px] ${
          isExclude && selectedValues.length > 0
            ? 'border-red-300 dark:border-red-600'
            : 'border-slate-200 dark:border-slate-600'
        }`}
      >
        <span className={`truncate ${selectedValues.length === 0 ? 'text-slate-400' : isExclude ? 'text-red-600 dark:text-red-400' : ''}`}>
          {displayText}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {selectedValues.length > 0 && (
            <span onClick={clearSelection} className="hover:bg-slate-200 dark:hover:bg-slate-600 rounded p-0.5">
              <X className="h-3 w-3 text-slate-400" />
            </span>
          )}
          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-w-[350px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50">
          {/* Include/Exclude Toggle */}
          <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Mode</span>
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: false }) }}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  !isExclude ? 'bg-white dark:bg-slate-600 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >Include</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (!isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: true }) }}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  isExclude ? 'bg-white dark:bg-slate-600 text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >Exclude</button>
            </div>
          </div>

          <div className="max-h-52 overflow-auto">
            {optionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                <span className="ml-2 text-xs text-slate-400">Loading...</span>
              </div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">No options</div>
            ) : (
              options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-2"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedValues.includes(opt)
                      ? isExclude ? 'bg-red-500 border-red-500' : 'bg-blue-500 border-blue-500'
                      : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {selectedValues.includes(opt) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="text-slate-700 dark:text-slate-200 truncate">{opt}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filter Picker (add filter on columns not in table) ─────────────────────

function FilterPicker({ availableSources, activeColumns, activeFilters, onAdd }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Determine which sources are in use (from columns or existing filters)
  const activeSources = new Set()
  activeColumns.forEach(c => activeSources.add(c.source))
  activeFilters.forEach(f => activeSources.add(f.source))

  // Also include compatible sources
  const compatibleSources = new Set(activeSources)
  activeSources.forEach(src => {
    const cfg = availableSources[src]
    if (cfg?.compatible_with) {
      cfg.compatible_with.forEach(cs => compatibleSources.add(cs))
    }
  })

  // Build list of filterable columns not already shown as auto-filters
  // Auto-filters = columns in the table that are string or datetime type
  const autoFilterKeys = new Set()
  activeColumns.forEach(c => {
    const srcCfg = availableSources[c.source]
    const colCfg = srcCfg?.columns?.find(col => col.key === c.field)
    if (colCfg && (colCfg.type === 'string' || colCfg.type === 'datetime')) {
      autoFilterKeys.add(`${c.source}__${c.field}`)
    }
  })

  // Already added extra filters
  const extraFilterKeys = new Set()
  activeFilters.forEach(f => {
    const key = `${f.source}__${f.field}`
    if (!autoFilterKeys.has(key)) extraFilterKeys.add(key)
  })

  // Build grouped options
  const groups = []
  const sourceOrder = [...compatibleSources]
  sourceOrder.forEach(srcKey => {
    const src = availableSources[srcKey]
    if (!src) return
    const cols = (src.columns || []).filter(col => {
      if (col.type !== 'string' && col.type !== 'datetime') return false
      const key = `${srcKey}__${col.key}`
      // Don't show if it's already an auto-filter from table columns
      if (autoFilterKeys.has(key)) return false
      // Don't show if already added as extra filter
      if (extraFilterKeys.has(key)) return false
      return true
    })
    if (cols.length > 0) {
      groups.push({ sourceKey: srcKey, sourceLabel: src.label, columns: cols })
    }
  })

  if (groups.length === 0 && !isOpen) return null

  return (
    <div className="relative flex-shrink-0 self-end" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 px-2.5 text-xs font-semibold rounded-lg border border-dashed flex items-center gap-1.5 transition-all ${
          isOpen
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
            : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
        Filter
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-[280px] bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-600">
            <div className="flex items-center gap-1.5">
              <ListFilter className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Add a filter</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Filter without adding to visible columns</p>
          </div>
          <div className="max-h-64 overflow-auto">
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">No additional filters available</div>
            ) : (
              groups.map(group => (
                <div key={group.sourceKey}>
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      {group.sourceLabel}
                    </span>
                  </div>
                  {group.columns.map(col => (
                    <button
                      key={`${group.sourceKey}__${col.key}`}
                      type="button"
                      onClick={() => {
                        onAdd(group.sourceKey, col.key, col.label, col.type)
                        setIsOpen(false)
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getDotColor(group.sourceKey)}`} />
                      <span>{col.label}</span>
                      <span className="ml-auto text-[10px] text-slate-400">{col.type === 'datetime' ? 'date' : 'list'}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Save As Modal ──────────────────────────────────────────────────────────

function SaveAsModal({ onSave, onCancel, saving, defaultName }) {
  const [name, setName] = useState(defaultName ? `${defaultName} (copy)` : '')
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)

  useEffect(() => {
    axios.get('/api/reports/saved/folders/list')
      .then(res => setFolders(res.data || []))
      .catch(() => {})
  }, [])

  const handleSave = () => {
    const folder = showNewFolder ? newFolderName.trim() : selectedFolder
    onSave(name.trim(), folder || null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Save Report As</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">Report Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter report name..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 block">Folder (optional)</label>
            {!showNewFolder ? (
              <div className="flex gap-2">
                <select
                  value={selectedFolder}
                  onChange={e => setSelectedFolder(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100"
                >
                  <option value="">No folder</option>
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <FolderPlus className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="New folder name..."
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100"
                />
                <button
                  onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
                  className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UnifiedReportView({ systemSlug, isNew }) {
  const { id: routeId } = useParams()
  const navigate = useNavigate()

  const report = useUnifiedReport()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  // Extra filters: filters on columns not in the table
  // [{source, field, label, type}]
  const [extraFilters, setExtraFilters] = useState([])

  // Row selection - temporarily disabled
  // const [selectedRows, setSelectedRows] = useState({})
  // const [actionPanelDevices, setActionPanelDevices] = useState(null)

  // Load report on mount
  useEffect(() => {
    if (systemSlug) {
      report.loadReportBySlug(systemSlug)
    } else if (routeId) {
      report.loadReportById(routeId)
    } else if (isNew) {
      // New empty report - open column picker
      setPickerOpen(true)
    }
  }, [systemSlug, routeId, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Save handler
  const handleSave = async () => {
    setSaving(true)
    try {
      await report.saveReport()
      setToast({ type: 'success', message: 'Report saved' })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  // Save As handler
  const handleSaveAs = async (name, folder) => {
    setSaving(true)
    try {
      const result = await report.saveAsReport(name, folder)
      setSaveAsOpen(false)
      setToast({ type: 'success', message: 'Report saved as "' + name + '"' })
      navigate(`/reports/saved/${result.id}`, { replace: true })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  // Reset handler
  const handleReset = async () => {
    try {
      await report.resetToDefault()
      setToast({ type: 'success', message: 'Reset to default' })
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to reset' })
    }
  }

  // Row click -> action panel (temporarily disabled)
  // const handleRowClick = (row) => {
  //   setActionPanelDevices([row])
  // }

  // Build filterable columns from active columns (only string-type columns)
  const filterableColumns = report.tableColumns.filter(c => c.type === 'string')
  // Date columns for range picker
  const dateColumns = report.tableColumns.filter(c => c.type === 'datetime')

  // Get current sort direction for a column
  const getSortDirection = (columnKey) => {
    const [source, field] = columnKey.split('__')
    const s = report.sort.find(s => s.source === source && s.field === field)
    return s?.direction || null
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
            {report.reportName || (isNew ? 'New Report' : 'Report')}
          </h1>
          {report.isSystem && (
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full flex-none uppercase">
              System
            </span>
          )}
          {report.isDirty && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex-none">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-none">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Columns ({report.columns.length})
          </button>

          {report.reportId && (
            <button
              onClick={handleSave}
              disabled={saving || !report.isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          )}

          <button
            onClick={() => setSaveAsOpen(true)}
            disabled={report.columns.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Save As
          </button>

          {report.isSystem && (
            <button
              onClick={handleReset}
              disabled={!report.isDirty}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}

          <button
            onClick={report.exportCSV}
            disabled={report.data.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Dynamic Filter Bar */}
      {(filterableColumns.length > 0 || dateColumns.length > 0 || extraFilters.length > 0 || report.columns.length > 0) && (
        <div className="flex items-end gap-x-3 gap-y-2 px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 flex-shrink-0 flex-wrap relative z-20">
          {/* Search */}
          <div className="flex flex-col gap-1 min-w-[200px] flex-shrink-0">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={report.search}
                onChange={e => report.setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full h-9 pl-8 pr-8 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {report.search && (
                <button onClick={() => report.setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Date range pickers for datetime columns in table */}
          {dateColumns.map(col => {
            const filterVal = report.filters.find(f => f.source === col.source && f.field === col.field)
            return (
              <DateRangePicker
                key={`date-${col.key}`}
                label={col.label}
                dateFrom={filterVal?.date_from || null}
                dateTo={filterVal?.date_to || null}
                onChange={(from, to) => report.setDateRange(col.source, col.field, from, to)}
              />
            )
          })}

          {/* Dynamic filter dropdowns for string columns in table */}
          {filterableColumns.map(col => {
            const filterVal = report.filters.find(f => f.source === col.source && f.field === col.field)
            return (
              <DynamicFilterDropdown
                key={col.key}
                source={col.source}
                field={col.field}
                label={col.label}
                value={filterVal ? { values: filterVal.values, exclude: filterVal.exclude } : null}
                onChange={(val) => {
                  report.setFilter(col.source, col.field, val?.values || [], val?.exclude || false)
                }}
                fetchOptions={report.fetchFilterOptions}
              />
            )
          })}

          {/* Extra filters (columns not in table, added via filter picker) */}
          {extraFilters.map(ef => {
            const filterVal = report.filters.find(f => f.source === ef.source && f.field === ef.field)
            if (ef.type === 'datetime') {
              return (
                <div key={`extra-${ef.source}__${ef.field}`} className="flex items-end gap-1 flex-shrink-0">
                  <DateRangePicker
                    label={<><span className="opacity-50">{report.availableSources[ef.source]?.label}:</span> {ef.label}</>}
                    dateFrom={filterVal?.date_from || null}
                    dateTo={filterVal?.date_to || null}
                    onChange={(from, to) => report.setDateRange(ef.source, ef.field, from, to)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      report.setDateRange(ef.source, ef.field, null, null)
                      setExtraFilters(prev => prev.filter(f => !(f.source === ef.source && f.field === ef.field)))
                    }}
                    className="h-9 w-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex-shrink-0"
                    title="Remove filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            }
            return (
              <div key={`extra-${ef.source}__${ef.field}`} className="flex items-end gap-1 flex-shrink-0">
                <DynamicFilterDropdown
                  source={ef.source}
                  field={ef.field}
                  label={<><span className="opacity-50">{report.availableSources[ef.source]?.label}:</span> {ef.label}</>}
                  value={filterVal ? { values: filterVal.values, exclude: filterVal.exclude } : null}
                  onChange={(val) => {
                    report.setFilter(ef.source, ef.field, val?.values || [], val?.exclude || false)
                  }}
                  fetchOptions={report.fetchFilterOptions}
                />
                <button
                  type="button"
                  onClick={() => {
                    report.setFilter(ef.source, ef.field, [], false)
                    setExtraFilters(prev => prev.filter(f => !(f.source === ef.source && f.field === ef.field)))
                  }}
                  className="h-9 w-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex-shrink-0"
                  title="Remove filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}

          {/* Add Filter picker */}
          <FilterPicker
            availableSources={report.availableSources}
            activeColumns={report.columns}
            activeFilters={[...report.filters, ...extraFilters.map(ef => ({ source: ef.source, field: ef.field }))]}
            onAdd={(source, field, label, type) => {
              setExtraFilters(prev => {
                if (prev.some(f => f.source === source && f.field === field)) return prev
                return [...prev, { source, field, label, type }]
              })
            }}
          />

          {/* Clear filters */}
          {(report.filters.length > 0 || report.search || extraFilters.length > 0) && (
            <button
              onClick={() => { report.clearFilters(); setExtraFilters([]) }}
              className="h-9 px-3 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex-none self-end"
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {/* Results info bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {report.loading ? 'Loading...' : `${report.total.toLocaleString()} results`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Per page:</span>
          {[25, 50, 100, 200].map(n => (
            <button
              key={n}
              onClick={() => report.setLimit(n)}
              className={`px-2 py-0.5 text-xs rounded transition ${
                report.limit === n
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto -mx-4 sm:mx-0">
        {report.columns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Columns3 className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
            <h2 className="text-lg font-bold text-slate-600 dark:text-slate-400 mb-2">
              {report.sourcesLoading ? 'Loading...' : 'No columns selected'}
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Click "Columns" to choose which data to display
            </p>
            <button
              onClick={() => setPickerOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition"
            >
              Choose Columns
            </button>
          </div>
        ) : report.error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{report.error}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                {report.tableColumns.map(col => {
                  const sortDir = getSortDirection(col.key)
                  return (
                    <th
                      key={col.key}
                      onClick={() => report.handleSort(col.key)}
                      className="px-3 py-2.5 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-none ${getDotColor(col.source)}`} />
                        {col.label}
                        {sortDir === 'asc' && <ChevronUp className="h-3 w-3 text-blue-500" />}
                        {sortDir === 'desc' && <ChevronDown className="h-3 w-3 text-blue-500" />}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {report.loading && report.data.length === 0 ? (
                <tr>
                  <td colSpan={report.tableColumns.length} className="py-16 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto" />
                  </td>
                </tr>
              ) : report.data.length === 0 ? (
                <tr>
                  <td colSpan={report.tableColumns.length} className="py-16 text-center text-slate-400">
                    No results found
                  </td>
                </tr>
              ) : (
                report.data.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                  >
                    {report.tableColumns.map(col => {
                      let val = row[col.key]
                      // Format display
                      if (val === null || val === undefined) val = ''
                      else if (typeof val === 'boolean') val = val ? 'Yes' : 'No'
                      else if (col.type === 'datetime' && val) {
                        try {
                          const d = new Date(val)
                          val = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        } catch { /* keep raw */ }
                      }
                      return (
                        <td key={col.key} className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[300px] truncate">
                          {String(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {report.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0">
          <span className="text-xs text-slate-500">
            Page {report.page} of {report.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => report.setPage(1)}
              disabled={report.page <= 1}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-4 w-4 text-slate-500" />
              <ChevronLeft className="h-4 w-4 text-slate-500 -ml-3" />
            </button>
            <button
              onClick={() => report.setPage(report.page - 1)}
              disabled={report.page <= 1}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronLeft className="h-4 w-4 text-slate-500" />
            </button>
            <button
              onClick={() => report.setPage(report.page + 1)}
              disabled={report.page >= report.totalPages}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
            <button
              onClick={() => report.setPage(report.totalPages)}
              disabled={report.page >= report.totalPages}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronRight className="h-4 w-4 text-slate-500" />
              <ChevronRight className="h-4 w-4 text-slate-500 -ml-3" />
            </button>
          </div>
        </div>
      )}

      {/* Column Picker Panel */}
      <ColumnPickerPanel
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        availableSources={report.availableSources}
        activeColumns={report.columns}
        onAddColumn={report.addColumn}
        onRemoveColumn={report.removeColumn}
        onReorderColumns={report.reorderColumns}
        allowedSources={report.allowedSources}
      />

      {/* Bulk Action Bar + Action Panel temporarily disabled */}

      {/* Save As Modal */}
      {saveAsOpen && (
        <SaveAsModal
          defaultName={report.reportName}
          saving={saving}
          onSave={handleSaveAs}
          onCancel={() => setSaveAsOpen(false)}
        />
      )}
    </div>
  )
}
