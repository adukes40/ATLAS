import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  Loader2, Download, Search, X, Check, Save,
  AlertTriangle, FolderPlus
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
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

const checkCompatibility = (selectedColumns, allSources) => {
  const usedSources = [...new Set(selectedColumns.map(c => c.source))]
  if (usedSources.length <= 1) return null
  for (let i = 0; i < usedSources.length; i++) {
    for (let j = i + 1; j < usedSources.length; j++) {
      const srcA = allSources[usedSources[i]]
      const srcB = allSources[usedSources[j]]
      if (!srcA || !srcB) continue
      if (!srcA.compatible_with.includes(usedSources[j]) && !srcB.compatible_with.includes(usedSources[i])) {
        return `Cannot combine ${srcA.label} with ${srcB.label} — no join path exists.`
      }
    }
  }
  return null
}

// Map selected columns + filter options to only show relevant filters
const FILTER_FIELD_MAP = {
  // IIQ / Google filter options → source.field
  locations:       { source: 'iiq_assets', field: 'location' },
  user_locations:  { source: 'iiq_users', field: 'location_name' },
  grades:          { source: 'iiq_users', field: 'grade' },
  iiq_statuses:    { source: 'iiq_assets', field: 'status' },
  google_statuses: { source: 'google_devices', field: 'status' },
  models:          { source: 'iiq_assets', field: 'model' },
  aue_years:       { source: 'google_devices', field: 'aue_date' },
  // Meraki filter options
  product_types:   { source: 'meraki_devices', field: 'product_type' },
  networks:        { source: 'meraki_networks', field: 'name' },
  statuses_meraki: { source: 'meraki_devices', field: 'status' },
  models_meraki:   { source: 'meraki_devices', field: 'model' },
  firmwares:       { source: 'meraki_devices', field: 'firmware' },
}

const FILTER_LABELS = {
  locations: 'Location (Assets)',
  user_locations: 'Location (Users)',
  grades: 'Grade',
  iiq_statuses: 'IIQ Status',
  google_statuses: 'Google Status',
  models: 'Model (IIQ)',
  aue_years: 'AUE Year',
  product_types: 'Product Type',
  networks: 'Network',
  statuses_meraki: 'Meraki Status',
  models_meraki: 'Meraki Model',
  firmwares: 'Firmware',
}

// ---------------------------------------------------------------------------
// MultiSelectDropdown (self-contained)
// ---------------------------------------------------------------------------

function MultiSelectDropdown({ label, options, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef(null)

  const parseValue = (val) => {
    if (!val) return { values: [], exclude: false }
    if (Array.isArray(val)) return { values: val, exclude: false }
    return { values: val.values || [], exclude: val.exclude || false }
  }

  const { values: selectedValues, exclude: isExclude } = parseValue(value)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleOption = (opt) => {
    const newValues = selectedValues.includes(opt)
      ? selectedValues.filter(v => v !== opt)
      : [...selectedValues, opt]
    onChange(newValues.length === 0 ? null : { values: newValues, exclude: isExclude })
  }

  const displayText = selectedValues.length === 0
    ? (placeholder || 'All')
    : selectedValues.length === 1
      ? (isExclude ? `Not: ${selectedValues[0]}` : selectedValues[0])
      : `${isExclude ? 'Exclude ' : ''}${selectedValues.length} selected`

  return (
    <div className="flex flex-col gap-1.5 relative" ref={ref}>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-10 px-3 rounded-lg border-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none cursor-pointer shadow-sm flex items-center justify-between gap-2 min-w-[200px] ${
          isExclude && selectedValues.length > 0 ? 'border-red-300 dark:border-red-600' : 'border-slate-200 dark:border-slate-600'
        }`}
      >
        <span className={`truncate ${selectedValues.length === 0 ? 'text-slate-400 dark:text-slate-500' : isExclude ? 'text-red-600 dark:text-red-400' : ''}`}>{displayText}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedValues.length > 0 && (
            <span onClick={(e) => { e.stopPropagation(); onChange(null) }} className="hover:bg-slate-200 dark:hover:bg-slate-600 rounded p-0.5">
              <X className="h-3 w-3 text-slate-400" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-w-[400px] bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Mode</span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); if (isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: false }) }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${!isExclude ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                Include
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); if (!isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: true }) }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${isExclude ? 'bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                Exclude
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No options</div>
            ) : options.map((opt) => (
              <button key={opt} type="button" onClick={() => toggleOption(opt)}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-3">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedValues.includes(opt) ? (isExclude ? 'bg-red-500 border-red-500' : 'bg-blue-500 border-blue-500') : 'border-slate-300 dark:border-slate-500'
                }`}>
                  {selectedValues.includes(opt) && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <span className="text-slate-700 dark:text-slate-200 truncate">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }) {
  const steps = [
    { num: 1, label: 'Select Columns' },
    { num: 2, label: 'Filters & Sort' },
    { num: 3, label: 'Preview & Save' },
  ]
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            current === s.num
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
              : current > s.num
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
          }`}>
            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${
              current === s.num
                ? 'bg-blue-600 text-white'
                : current > s.num
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-300 dark:bg-slate-600 text-white'
            }`}>
              {current > s.num ? <Check className="h-3 w-3" /> : s.num}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save Modal
// ---------------------------------------------------------------------------

function SaveModal({ onSave, onCancel, saving }) {
  const [name, setName] = useState('')
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
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Save Report</h2>

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
// Main Component
// ---------------------------------------------------------------------------

export default function CustomBuilder() {
  const navigate = useNavigate()

  // Step
  const [step, setStep] = useState(1)

  // Step 1 state
  const [allSources, setAllSources] = useState({})       // from GET /custom/columns
  const [selectedColumns, setSelectedColumns] = useState([])  // {source, field, label, type}
  const [collapsedSections, setCollapsedSections] = useState({})
  const [loadingSources, setLoadingSources] = useState(true)
  const [compatWarning, setCompatWarning] = useState(null)

  // Step 2 state
  const [filterOptions, setFilterOptions] = useState({})
  const [merakiFilterOptions, setMerakiFilterOptions] = useState({})
  const [filters, setFilters] = useState({})   // keyed by filter key, value is {values, exclude} or null
  const [loadingFilters, setLoadingFilters] = useState(false)

  // Step 3 state
  const [data, setData] = useState([])
  const [responseColumns, setResponseColumns] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [sortRules, setSortRules] = useState([])
  const [search, setSearch] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch all source columns on mount
  useEffect(() => {
    axios.get('/api/reports/custom/columns')
      .then(res => setAllSources(res.data.sources || {}))
      .catch(err => console.error('Failed to fetch columns:', err))
      .finally(() => setLoadingSources(false))
  }, [])

  // Recompute compatibility whenever selection changes
  useEffect(() => {
    setCompatWarning(checkCompatibility(selectedColumns, allSources))
  }, [selectedColumns, allSources])

  // Fetch filter options when entering step 2
  useEffect(() => {
    if (step !== 2) return
    const usedSources = [...new Set(selectedColumns.map(c => c.source))]
    const needsIiq = usedSources.some(s => ['iiq_assets', 'iiq_users', 'google_devices'].includes(s))
    const needsMeraki = usedSources.some(s => ['meraki_devices', 'meraki_networks'].includes(s))

    setLoadingFilters(true)
    const promises = []
    if (needsIiq) {
      promises.push(
        axios.get('/api/reports/filters/options')
          .then(res => setFilterOptions(res.data || {}))
          .catch(() => setFilterOptions({}))
      )
    }
    if (needsMeraki) {
      promises.push(
        axios.get('/api/reports/filters/meraki-options')
          .then(res => setMerakiFilterOptions(res.data || {}))
          .catch(() => setMerakiFilterOptions({}))
      )
    }
    Promise.all(promises).finally(() => setLoadingFilters(false))
  }, [step, selectedColumns])

  // Fetch query data
  const fetchData = useCallback(async () => {
    if (selectedColumns.length === 0) return
    setLoading(true)
    try {
      const body = {
        columns: selectedColumns.map(c => ({ source: c.source, field: c.field })),
        filters: buildFilterPayload(),
        sort: sortRules,
        page,
        limit: 25,
        search,
      }
      const res = await axios.post('/api/reports/custom/query', body)
      setData(res.data.data || [])
      setResponseColumns(res.data.columns || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.pages || 0)
    } catch (err) {
      console.error('Failed to fetch query:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedColumns, filters, sortRules, page, search])

  // Auto-fetch on step 3
  useEffect(() => {
    if (step === 3) fetchData()
  }, [step, fetchData])

  // Build filter payload from state
  const buildFilterPayload = () => {
    const result = []
    for (const [key, val] of Object.entries(filters)) {
      if (!val || !val.values || val.values.length === 0) continue
      const mapping = FILTER_FIELD_MAP[key]
      if (!mapping) continue
      result.push({ source: mapping.source, field: mapping.field, values: val.values, exclude: val.exclude || false })
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Column selection helpers
  // ---------------------------------------------------------------------------

  const toggleColumn = (source, col) => {
    const exists = selectedColumns.find(c => c.source === source && c.field === col.key)
    if (exists) {
      setSelectedColumns(prev => prev.filter(c => !(c.source === source && c.field === col.key)))
    } else {
      setSelectedColumns(prev => [...prev, { source, field: col.key, label: col.label, type: col.type }])
    }
  }

  const isColumnSelected = (source, key) => selectedColumns.some(c => c.source === source && c.field === key)

  const selectAllSource = (sourceKey) => {
    const src = allSources[sourceKey]
    if (!src) return
    const existing = selectedColumns.filter(c => c.source !== sourceKey)
    const newCols = src.columns.map(col => ({ source: sourceKey, field: col.key, label: col.label, type: col.type }))
    setSelectedColumns([...existing, ...newCols])
  }

  const clearSource = (sourceKey) => {
    setSelectedColumns(prev => prev.filter(c => c.source !== sourceKey))
  }

  const countSelected = (sourceKey) => selectedColumns.filter(c => c.source === sourceKey).length

  const toggleSection = (sourceKey) => {
    setCollapsedSections(prev => ({ ...prev, [sourceKey]: !prev[sourceKey] }))
  }

  // ---------------------------------------------------------------------------
  // Sort helpers
  // ---------------------------------------------------------------------------

  const handleSort = (colKey, shiftKey) => {
    // colKey is "source__field"
    const parts = colKey.split('__')
    const source = parts[0]
    const field = parts.slice(1).join('__')
    const existing = sortRules.findIndex(s => s.source === source && s.field === field)

    if (shiftKey) {
      // Multi-sort
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
      // Single sort
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
        columns: selectedColumns.map(c => ({ source: c.source, field: c.field })),
        filters: buildFilterPayload(),
        sort: sortRules,
        page: 1,
        limit: 50000,
        search,
      }
      const res = await axios.post('/api/reports/custom/query/export/csv', body, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `custom_report_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export CSV:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Save report
  // ---------------------------------------------------------------------------

  const handleSaveReport = async ({ name, folder }) => {
    setSaving(true)
    try {
      const config = {
        columns: selectedColumns,
        filters: buildFilterPayload(),
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
      setShowSaveModal(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Relevant filters for step 2
  // ---------------------------------------------------------------------------

  const getRelevantFilters = () => {
    const usedSources = new Set(selectedColumns.map(c => c.source))
    const result = []

    // IIQ / Google filters
    if (usedSources.has('iiq_assets') || usedSources.has('iiq_users') || usedSources.has('google_devices')) {
      if (usedSources.has('iiq_assets') && filterOptions.locations) {
        result.push({ key: 'locations', label: FILTER_LABELS.locations, options: filterOptions.locations })
      }
      if (usedSources.has('iiq_users') && filterOptions.user_locations) {
        result.push({ key: 'user_locations', label: FILTER_LABELS.user_locations, options: filterOptions.user_locations })
      }
      if (usedSources.has('iiq_users') && filterOptions.grades) {
        result.push({ key: 'grades', label: FILTER_LABELS.grades, options: filterOptions.grades })
      }
      if (usedSources.has('iiq_assets') && filterOptions.iiq_statuses) {
        result.push({ key: 'iiq_statuses', label: FILTER_LABELS.iiq_statuses, options: filterOptions.iiq_statuses })
      }
      if (usedSources.has('google_devices') && filterOptions.google_statuses) {
        result.push({ key: 'google_statuses', label: FILTER_LABELS.google_statuses, options: filterOptions.google_statuses })
      }
      if (usedSources.has('iiq_assets') && filterOptions.models) {
        result.push({ key: 'models', label: FILTER_LABELS.models, options: filterOptions.models })
      }
      if (usedSources.has('google_devices') && filterOptions.aue_years) {
        result.push({ key: 'aue_years', label: FILTER_LABELS.aue_years, options: filterOptions.aue_years })
      }
    }

    // Meraki filters
    if (usedSources.has('meraki_devices') || usedSources.has('meraki_networks')) {
      if (usedSources.has('meraki_devices') && merakiFilterOptions.product_types) {
        result.push({ key: 'product_types', label: FILTER_LABELS.product_types, options: merakiFilterOptions.product_types })
      }
      if (usedSources.has('meraki_networks') && merakiFilterOptions.networks) {
        result.push({ key: 'networks', label: FILTER_LABELS.networks, options: merakiFilterOptions.networks })
      }
      if (usedSources.has('meraki_devices') && merakiFilterOptions.statuses) {
        result.push({ key: 'statuses_meraki', label: FILTER_LABELS.statuses_meraki, options: merakiFilterOptions.statuses })
      }
      if (usedSources.has('meraki_devices') && merakiFilterOptions.models) {
        result.push({ key: 'models_meraki', label: FILTER_LABELS.models_meraki, options: merakiFilterOptions.models })
      }
      if (usedSources.has('meraki_devices') && merakiFilterOptions.firmwares) {
        result.push({ key: 'firmwares', label: FILTER_LABELS.firmwares, options: merakiFilterOptions.firmwares })
      }
    }

    return result
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (loadingSources) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // ---- Step 1: Select Columns ----
  if (step === 1) {
    const sourceKeys = Object.keys(allSources)
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Custom Report Builder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Select columns from one or more data sources to build your report.</p>
        </div>

        <StepIndicator current={1} />

        {/* Compatibility warning */}
        {compatWarning && (
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{compatWarning}</span>
          </div>
        )}

        {/* Selected summary */}
        {selectedColumns.length > 0 && (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''} selected
            {' from '}
            {[...new Set(selectedColumns.map(c => allSources[c.source]?.label))].filter(Boolean).join(', ')}
          </div>
        )}

        {/* Source sections */}
        <div className="space-y-3">
          {sourceKeys.map(sourceKey => {
            const src = allSources[sourceKey]
            const collapsed = collapsedSections[sourceKey]
            const count = countSelected(sourceKey)
            return (
              <div key={sourceKey} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(sourceKey)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${dotClass(sourceKey)}`} />
                    <span className="font-medium text-slate-800 dark:text-slate-100">{src.label}</span>
                    {count > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
                        {count} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      onClick={(e) => { e.stopPropagation(); selectAllSource(sourceKey) }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Select All
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); clearSource(sourceKey) }}
                      className="text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                    >
                      Clear
                    </span>
                    {collapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>

                {/* Columns grid */}
                {!collapsed && (
                  <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {src.columns.map(col => {
                      const checked = isColumnSelected(sourceKey, col.key)
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                            checked
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                              : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleColumn(sourceKey, col)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-slate-700 dark:text-slate-300 truncate">{col.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Navigation */}
        <div className="flex justify-end">
          <button
            onClick={() => setStep(2)}
            disabled={selectedColumns.length === 0 || !!compatWarning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Filters
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ---- Step 2: Filters & Sort ----
  if (step === 2) {
    const relevantFilters = getRelevantFilters()
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Custom Report Builder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Configure filters for your report. All filters are optional.</p>
        </div>

        <StepIndicator current={2} />

        {loadingFilters ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : relevantFilters.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <p className="text-sm">No filters available for the selected columns.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-4">Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {relevantFilters.map(f => (
                <MultiSelectDropdown
                  key={f.key}
                  label={f.label}
                  options={f.options}
                  value={filters[f.key] || null}
                  onChange={val => setFilters(prev => ({ ...prev, [f.key]: val }))}
                  placeholder="All"
                />
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={() => { setPage(1); setStep(3) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Continue to Preview
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ---- Step 3: Preview & Save ----
  // Derive column info from selectedColumns for headers
  const colHeaders = selectedColumns.map(c => ({
    key: `${c.source}__${c.field}`,
    source: c.source,
    label: c.label,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Custom Report Builder</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Preview your report results.</p>
      </div>

      <StepIndicator current={3} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep(2)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Edit Filters
          </button>
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Edit Columns
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Save Report
          </button>
          <button
            onClick={handleExportCSV}
            disabled={loading || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
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
                  <td colSpan={colHeaders.length} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colHeaders.length} className="py-12 text-center text-slate-500 dark:text-slate-400">
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
            {/* Page number buttons */}
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

      {/* Save Modal */}
      {showSaveModal && (
        <SaveModal
          onSave={handleSaveReport}
          onCancel={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}
    </div>
  )
}
