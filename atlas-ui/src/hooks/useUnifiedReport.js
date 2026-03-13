/**
 * useUnifiedReport - Hook for the unified report view.
 * Manages columns, filters, sort, pagination, search, query execution,
 * filter option fetching, dirty tracking, save/export.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

export default function useUnifiedReport() {
  // Report metadata
  const [reportId, setReportId] = useState(null)
  const [reportName, setReportName] = useState('')
  const [isSystem, setIsSystem] = useState(false)
  const [systemSlug, setSystemSlug] = useState(null)
  const [queryType, setQueryType] = useState('standard')
  const [specializedKey, setSpecializedKey] = useState(null)
  const [allowedSources, setAllowedSources] = useState(null)

  // Available columns from server
  const [availableSources, setAvailableSources] = useState({})
  const [sourcesLoading, setSourcesLoading] = useState(true)

  // Active columns (ordered array of { source, field })
  const [columns, setColumns] = useState([])

  // Filters (array of { source, field, values: [], exclude: bool })
  const [filters, setFilters] = useState([])

  // Sort (array of { source, field, direction })
  const [sort, setSort] = useState([])

  // Pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)

  // Search
  const [search, setSearch] = useState('')

  // Query results
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Dirty tracking
  const [savedConfig, setSavedConfig] = useState(null)
  const [isDirty, setIsDirty] = useState(false)

  // Filter options cache: { "source.field": [...options] }
  const filterCache = useRef({})

  // Fetch available columns/sources on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await axios.get('/api/reports/custom/columns')
        setAvailableSources(res.data.sources || {})
      } catch (err) {
        console.error('Failed to fetch columns:', err)
      } finally {
        setSourcesLoading(false)
      }
    }
    fetchSources()
  }, [])

  // Track dirty state
  useEffect(() => {
    if (!savedConfig) {
      setIsDirty(columns.length > 0)
      return
    }
    const currentConfig = { columns, filters, sort }
    setIsDirty(JSON.stringify(currentConfig) !== JSON.stringify(savedConfig))
  }, [columns, filters, sort, savedConfig])

  // Load a report config (from saved report or system template)
  const loadConfig = useCallback((config, meta = {}) => {
    const cols = (config.columns || []).map(c => ({
      source: c.source,
      field: c.field,
    }))
    setColumns(cols)
    setFilters(config.filters || [])
    setSort(config.sort || [])
    setQueryType(config.query_type || 'standard')
    setSpecializedKey(config.specialized_key || null)
    setAllowedSources(config.allowed_sources || null)
    setPage(1)
    setSearch('')

    // Save reference for dirty tracking
    setSavedConfig({
      columns: cols,
      filters: config.filters || [],
      sort: config.sort || [],
    })

    if (meta.id) setReportId(meta.id)
    if (meta.name) setReportName(meta.name)
    if (meta.is_system !== undefined) setIsSystem(meta.is_system)
    if (meta.system_slug) setSystemSlug(meta.system_slug)
  }, [])

  // Load report by ID
  const loadReportById = useCallback(async (id) => {
    try {
      const res = await axios.get(`/api/reports/saved/${id}`)
      const r = res.data
      loadConfig(r.config, {
        id: r.id,
        name: r.name,
        is_system: r.is_system,
        system_slug: r.system_slug,
      })
      return r
    } catch (err) {
      console.error('Failed to load report:', err)
      setError('Failed to load report')
      return null
    }
  }, [loadConfig])

  // Load report by system slug
  const loadReportBySlug = useCallback(async (slug) => {
    try {
      const res = await axios.get(`/api/reports/saved/by-slug/${slug}`)
      const r = res.data
      loadConfig(r.config, {
        id: r.id,
        name: r.name,
        is_system: r.is_system,
        system_slug: r.system_slug,
      })
      return r
    } catch (err) {
      console.error('Failed to load report by slug:', err)
      setError('Failed to load report')
      return null
    }
  }, [loadConfig])

  // Execute the report query
  const executeQuery = useCallback(async () => {
    if (columns.length === 0) {
      setData([])
      setTotal(0)
      setTotalPages(0)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const body = {
        query_type: queryType,
        specialized_key: specializedKey,
        columns: columns.map(c => ({ source: c.source, field: c.field })),
        filters: filters.filter(f => (f.values && f.values.length > 0) || f.date_from || f.date_to),
        sort: sort.map(s => ({ source: s.source, field: s.field, direction: s.direction })),
        page,
        limit,
        search,
      }
      const res = await axios.post('/api/reports/execute', body)
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
      setTotalPages(res.data.pages || 0)
    } catch (err) {
      console.error('Query error:', err)
      setError(err.response?.data?.detail || 'Failed to execute query')
      setData([])
      setTotal(0)
      setTotalPages(0)
    } finally {
      setLoading(false)
    }
  }, [columns, filters, sort, page, limit, search, queryType, specializedKey])

  // Auto-execute when query params change
  useEffect(() => {
    if (columns.length > 0) {
      executeQuery()
    }
  }, [executeQuery])

  // Reset page on filter/search/sort change
  const resetPage = useCallback(() => setPage(1), [])

  // Column management
  const addColumn = useCallback((source, field) => {
    setColumns(prev => {
      if (prev.some(c => c.source === source && c.field === field)) return prev
      return [...prev, { source, field }]
    })
    resetPage()
  }, [resetPage])

  const removeColumn = useCallback((source, field) => {
    setColumns(prev => prev.filter(c => !(c.source === source && c.field === field)))
    // Also remove any filters/sort on this column
    setFilters(prev => prev.filter(f => !(f.source === source && f.field === field)))
    setSort(prev => prev.filter(s => !(s.source === source && s.field === field)))
    resetPage()
  }, [resetPage])

  const reorderColumns = useCallback((newColumns) => {
    setColumns(newColumns)
  }, [])

  // Filter management
  const setFilter = useCallback((source, field, values, exclude = false) => {
    setFilters(prev => {
      const existing = prev.findIndex(f => f.source === source && f.field === field)
      if (!values || values.length === 0) {
        return prev.filter(f => !(f.source === source && f.field === field))
      }
      const newFilter = { source, field, values, exclude }
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = newFilter
        return next
      }
      return [...prev, newFilter]
    })
    resetPage()
  }, [resetPage])

  // Date range filter management
  const setDateRange = useCallback((source, field, dateFrom, dateTo) => {
    setFilters(prev => {
      const existing = prev.findIndex(f => f.source === source && f.field === field)
      if (!dateFrom && !dateTo) {
        return prev.filter(f => !(f.source === source && f.field === field))
      }
      const newFilter = { source, field, values: [], exclude: false, date_from: dateFrom || null, date_to: dateTo || null }
      if (existing >= 0) {
        const next = [...prev]
        // Preserve existing discrete values if any
        newFilter.values = prev[existing].values || []
        newFilter.exclude = prev[existing].exclude || false
        next[existing] = newFilter
        return next
      }
      return [...prev, newFilter]
    })
    resetPage()
  }, [resetPage])

  const clearFilters = useCallback(() => {
    setFilters([])
    setSearch('')
    resetPage()
  }, [resetPage])

  // Sort management
  const handleSort = useCallback((columnKey) => {
    // columnKey format: "source__field"
    const [source, field] = columnKey.split('__')
    if (!source || !field) return

    setSort(prev => {
      const existing = prev.find(s => s.source === source && s.field === field)
      if (existing) {
        if (existing.direction === 'asc') {
          return [{ source, field, direction: 'desc' }]
        }
        return [] // Toggle off
      }
      return [{ source, field, direction: 'asc' }]
    })
    resetPage()
  }, [resetPage])

  // Fetch filter options for a column
  const fetchFilterOptions = useCallback(async (source, field) => {
    const cacheKey = `${source}.${field}`
    if (filterCache.current[cacheKey]) {
      return filterCache.current[cacheKey]
    }
    try {
      const res = await axios.post('/api/reports/custom/filter-options', { source, field })
      const options = res.data.options || []
      filterCache.current[cacheKey] = options
      return options
    } catch (err) {
      console.error(`Failed to fetch filter options for ${source}.${field}:`, err)
      return []
    }
  }, [])

  // Save report
  const saveReport = useCallback(async () => {
    if (!reportId) return null
    const config = {
      query_type: queryType,
      specialized_key: specializedKey,
      columns: columns.map(c => ({ source: c.source, field: c.field })),
      filters,
      sort,
    }
    if (allowedSources) config.allowed_sources = allowedSources
    try {
      const res = await axios.put(`/api/reports/saved/${reportId}`, { config })
      setSavedConfig({ columns: [...columns], filters: [...filters], sort: [...sort] })
      return res.data
    } catch (err) {
      throw err
    }
  }, [reportId, columns, filters, sort, queryType, specializedKey, allowedSources])

  // Save as new report
  const saveAsReport = useCallback(async (name, folder) => {
    const config = {
      query_type: queryType,
      specialized_key: specializedKey,
      columns: columns.map(c => ({ source: c.source, field: c.field })),
      filters,
      sort,
    }
    if (allowedSources) config.allowed_sources = allowedSources
    try {
      const res = await axios.post('/api/reports/saved', { name, folder, config })
      setReportId(res.data.id)
      setReportName(name)
      setIsSystem(false)
      setSystemSlug(null)
      setSavedConfig({ columns: [...columns], filters: [...filters], sort: [...sort] })
      return res.data
    } catch (err) {
      throw err
    }
  }, [columns, filters, sort, queryType, specializedKey, allowedSources])

  // Reset to default (system templates only)
  const resetToDefault = useCallback(async () => {
    if (!reportId || !isSystem) return
    try {
      const res = await axios.post(`/api/reports/saved/${reportId}/reset`)
      loadConfig(res.data.config, {
        id: res.data.id,
        name: res.data.name,
        is_system: true,
        system_slug: res.data.system_slug,
      })
      return res.data
    } catch (err) {
      throw err
    }
  }, [reportId, isSystem, loadConfig])

  // Export CSV
  const exportCSV = useCallback(async () => {
    try {
      const body = {
        query_type: queryType,
        specialized_key: specializedKey,
        columns: columns.map(c => ({ source: c.source, field: c.field })),
        filters: filters.filter(f => (f.values && f.values.length > 0) || f.date_from || f.date_to),
        sort: sort.map(s => ({ source: s.source, field: s.field, direction: s.direction })),
        page: 1,
        limit: 50000,
        search,
      }
      const res = await axios.post('/api/reports/execute/export/csv', body, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      const filename = `${reportName || 'report'}_${new Date().toISOString().slice(0, 10)}.csv`
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV export failed:', err)
      alert('Failed to export CSV')
    }
  }, [columns, filters, sort, search, queryType, specializedKey, reportName])

  // Build column definitions for ReportTable from active columns
  const tableColumns = columns.map(col => {
    const key = `${col.source}__${col.field}`
    const sourceInfo = availableSources[col.source]
    const colInfo = sourceInfo?.columns?.find(c => c.key === col.field)
    return {
      key,
      label: colInfo?.label || col.field,
      source: col.source,
      field: col.field,
      type: colInfo?.type || 'string',
    }
  })

  return {
    // Report metadata
    reportId,
    reportName,
    setReportName,
    isSystem,
    systemSlug,
    queryType,
    specializedKey,
    allowedSources,

    // Available sources
    availableSources,
    sourcesLoading,

    // Active columns
    columns,
    tableColumns,
    addColumn,
    removeColumn,
    reorderColumns,

    // Filters
    filters,
    setFilter,
    setDateRange,
    clearFilters,
    fetchFilterOptions,

    // Sort
    sort,
    handleSort,

    // Pagination
    page,
    setPage,
    limit,
    setLimit: useCallback((newLimit) => { setLimit(newLimit); setPage(1) }, []),
    total,
    totalPages,

    // Search
    search,
    setSearch: useCallback((val) => { setSearch(val); setPage(1) }, []),

    // Data
    data,
    loading,
    error,

    // Actions
    loadReportById,
    loadReportBySlug,
    loadConfig,
    executeQuery,
    saveReport,
    saveAsReport,
    resetToDefault,
    exportCSV,

    // Dirty tracking
    isDirty,
  }
}
