/**
 * useReportQuery - Shared hook for report data fetching and state management.
 * Extracts common patterns from report components to eliminate duplication.
 */
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

/**
 * Helper to append filter values to URLSearchParams.
 * Handles multiple formats: { values: [], exclude: boolean }, arrays, and strings.
 */
function appendFilter(params, key, value) {
  if (!value) return

  // Handle new format: { values: [], exclude: boolean }
  if (value.values && Array.isArray(value.values) && value.values.length > 0) {
    params.append(key, value.values.join(','))
    if (value.exclude) {
      params.append(`${key}_exclude`, 'true')
    }
  }
  // Handle legacy array format
  else if (Array.isArray(value) && value.length > 0) {
    params.append(key, value.join(','))
  }
  // Handle simple string
  else if (typeof value === 'string') {
    params.append(key, value)
  }
}

/**
 * Custom hook for report queries with filtering, sorting, pagination, and export.
 *
 * @param {string} endpoint - API endpoint path (e.g., 'device-inventory')
 * @param {Object} options - Configuration options
 * @param {Object} options.defaultFilters - Initial filter state (keys determine which filters are used)
 * @param {string} options.defaultSort - Initial sort column
 * @param {string} options.defaultOrder - Initial sort order ('asc' or 'desc')
 * @param {boolean} options.hasSearch - Whether this report supports search
 * @param {string} options.exportFilename - Base filename for CSV export
 *
 * @returns {Object} Report state and handlers
 */
export default function useReportQuery(endpoint, options = {}) {
  const {
    defaultFilters = {},
    defaultSort = '',
    defaultOrder = 'asc',
    hasSearch = false,
    exportFilename = endpoint
  } = options

  // Data state
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState(defaultFilters)
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState(defaultSort)
  const [sortOrder, setSortOrder] = useState(defaultOrder)
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(100)

  // Fetch filter options on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await axios.get('/api/reports/filters/options')
        setFilterOptions(res.data)
      } catch (err) {
        console.error('Failed to fetch filter options:', err)
      }
    }
    fetchOptions()
  }, [])

  // Build query params from current state
  const buildParams = useCallback((includeSearch = true) => {
    const params = new URLSearchParams()

    // Add all filters
    Object.entries(filters).forEach(([key, value]) => {
      appendFilter(params, key, value)
    })

    // Add search if enabled and provided
    if (hasSearch && includeSearch && search) {
      params.append('search', search)
    }

    return params
  }, [filters, search, hasSearch])

  // Fetch report data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = buildParams()
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/${endpoint}?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error(`Failed to fetch ${endpoint}:`, err)
    } finally {
      setLoading(false)
    }
  }, [endpoint, buildParams, sortColumn, sortOrder, page, limit])

  // Trigger fetch when dependencies change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset to page 0 when search changes
  useEffect(() => {
    if (hasSearch) {
      setPage(0)
    }
  }, [search, hasSearch])

  // Handle filter change - reset to page 0
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }, [])

  // Handle sort change
  const handleSort = useCallback((column, order) => {
    setSortColumn(column)
    setSortOrder(order)
    setPage(0)
  }, [])

  // Handle limit change
  const handleLimitChange = useCallback((newLimit) => {
    setLimit(newLimit)
    setPage(0)
  }, [])

  // Handle CSV export
  const handleExportCSV = useCallback(async () => {
    const params = buildParams()

    try {
      const res = await axios.get(`/api/reports/${endpoint}/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${exportFilename}_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error(`Failed to export ${endpoint} CSV:`, err)
      alert('Failed to export CSV')
    }
  }, [endpoint, exportFilename, buildParams])

  // Refresh data manually
  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    // Data state
    data,
    loading,
    total,
    totalPages,
    filterOptions,

    // Query state
    filters,
    search,
    sortColumn,
    sortOrder,
    page,
    limit,

    // State setters (for direct control)
    setFilters,
    setSearch,
    setPage,
    setLimit,

    // Event handlers (for ReportTable)
    handleFilterChange,
    handleSort,
    handleLimitChange,
    handleExportCSV,
    refresh
  }
}
