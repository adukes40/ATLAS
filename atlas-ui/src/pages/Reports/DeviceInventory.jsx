import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function DeviceInventory() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    iiq_status: null,
    google_status: null,
    location: null,
    model: null,
    grade: null
  })
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState('asset_tag')
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
      appendFilter(params, 'iiq_status', filters.iiq_status)
      appendFilter(params, 'google_status', filters.google_status)
      appendFilter(params, 'location', filters.location)
      appendFilter(params, 'model', filters.model)
      appendFilter(params, 'grade', filters.grade)
      if (search) params.append('search', search)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/device-inventory?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch device inventory:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, search, sortColumn, sortOrder, page, limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle filter change - reset to page 0
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }

  // Handle search - debounced reset to page 0
  useEffect(() => {
    setPage(0)
  }, [search])

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
    appendFilter(params, 'iiq_status', filters.iiq_status)
    appendFilter(params, 'google_status', filters.google_status)
    appendFilter(params, 'location', filters.location)
    appendFilter(params, 'model', filters.model)
    appendFilter(params, 'grade', filters.grade)
    if (search) params.append('search', search)

    try {
      const res = await axios.get(`/api/reports/device-inventory/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `device_inventory_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Failed to export CSV')
    }
  }

  // Column definitions
  const columns = [
    { key: 'asset_tag', label: 'Asset Tag' },
    { key: 'serial_number', label: 'Serial' },
    { key: 'model', label: 'Model' },
    { key: 'iiq_status', label: 'IIQ Status' },
    { key: 'google_status', label: 'Google Status', render: (val) => val || '-' },
    { key: 'location', label: 'Location' },
    { key: 'assigned_user', label: 'Assigned User' },
    { key: 'grade', label: 'Grade' },
    { key: 'aue_date', label: 'AUE Date', render: (val) => val || '-' }
  ]

  // Filter definitions
  const filterDefs = [
    { key: 'iiq_status', label: 'IIQ Status', options: filterOptions.iiq_statuses || [], placeholder: 'All IIQ Statuses' },
    { key: 'google_status', label: 'Google Status', options: filterOptions.google_statuses || [], placeholder: 'All Google Statuses' },
    { key: 'location', label: 'Location', options: filterOptions.locations || [], placeholder: 'All Locations' },
    { key: 'model', label: 'Model', options: filterOptions.models || [], placeholder: 'All Models' },
    { key: 'grade', label: 'Grade', options: filterOptions.grades || [], placeholder: 'All Grades' }
  ]

  return (
    <ReportTable
      title="Device Inventory"
      description="All devices with assigned user information"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by serial, tag, or user..."
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
      emptyMessage="No devices found matching your filters"
    />
  )
}
