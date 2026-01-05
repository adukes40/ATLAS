import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function AueReport() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    aue_year: null,
    iiq_status: null,
    google_status: null,
    model: null
  })
  const [sortColumn, setSortColumn] = useState('aue_date')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(100)

  // Fetch filter options
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

  // Helper to append filter (handles arrays and exclude mode)
  const appendFilter = (params, key, value) => {
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

  // Fetch report data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      appendFilter(params, 'aue_year', filters.aue_year)
      appendFilter(params, 'iiq_status', filters.iiq_status)
      appendFilter(params, 'google_status', filters.google_status)
      appendFilter(params, 'model', filters.model)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/aue-eol?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch AUE report:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, sortColumn, sortOrder, page, limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }

  // Handle sort
  const handleSort = (column, order) => {
    setSortColumn(column)
    setSortOrder(order)
    setPage(0)
  }

  // Handle limit change
  const handleLimitChange = (newLimit) => {
    setLimit(newLimit)
    setPage(0)
  }

  // Handle CSV export
  const handleExportCSV = async () => {
    const params = new URLSearchParams()
    appendFilter(params, 'aue_year', filters.aue_year)
    appendFilter(params, 'iiq_status', filters.iiq_status)
    appendFilter(params, 'google_status', filters.google_status)
    appendFilter(params, 'model', filters.model)

    try {
      const res = await axios.get(`/api/reports/aue-eol/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `aue_eol_report_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Failed to export CSV')
    }
  }

  // Get expiration status styling
  const getExpirationStyle = (expStatus) => {
    switch (expStatus) {
      case 'expired':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      case 'expiring_soon':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
      default:
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    }
  }

  // Column definitions
  const columns = [
    { key: 'serial_number', label: 'Serial' },
    { key: 'model', label: 'Model' },
    {
      key: 'aue_date',
      label: 'AUE Date',
      render: (val, row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getExpirationStyle(row.expiration_status)}`}>
          {val || 'Unknown'}
        </span>
      )
    },
    { key: 'iiq_status', label: 'IIQ Status', render: (val) => val || '-' },
    { key: 'google_status', label: 'Google Status' },
    { key: 'os_version', label: 'OS Version' },
    { key: 'assigned_user', label: 'Assigned User' },
    { key: 'org_unit_path', label: 'OU' }
  ]

  // Filter definitions
  const filterDefs = [
    { key: 'aue_year', label: 'AUE Year', options: filterOptions.aue_years || [], placeholder: 'All Years' },
    { key: 'iiq_status', label: 'IIQ Status', options: filterOptions.iiq_statuses || [], placeholder: 'All IIQ Statuses' },
    { key: 'google_status', label: 'Google Status', options: filterOptions.google_statuses || [], placeholder: 'All Google Statuses' },
    { key: 'model', label: 'Model', options: filterOptions.models || [], placeholder: 'All Models' }
  ]

  return (
    <ReportTable
      title="AUE / End-of-Life Report"
      description="Chromebooks sorted by Auto Update Expiration date"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      sortColumn={sortColumn}
      sortOrder={sortOrder}
      onSort={handleSort}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={setPage}
      limit={limit}
      onLimitChange={handleLimitChange}
      loading={loading}
      onExportCSV={handleExportCSV}
      emptyMessage="No devices found with AUE data"
    />
  )
}
