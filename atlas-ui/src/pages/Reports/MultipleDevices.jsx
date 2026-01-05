import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function MultipleDevices() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    location: null,
    min_count: null
  })
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState('device_count')
  const [sortOrder, setSortOrder] = useState('desc')
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
      appendFilter(params, 'location', filters.location)
      appendFilter(params, 'min_count', filters.min_count)
      if (search) params.append('search', search)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/multiple-devices?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch multiple devices report:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, search, sortColumn, sortOrder, page, limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(0)
  }

  // Handle search
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
    appendFilter(params, 'location', filters.location)
    appendFilter(params, 'min_count', filters.min_count)

    try {
      const res = await axios.get(`/api/reports/multiple-devices/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `multiple_devices_${new Date().toISOString().slice(0, 10)}.csv`)
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
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'grade', label: 'Grade' },
    { key: 'location', label: 'Location' },
    {
      key: 'device_count',
      label: 'Devices',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          val > 3
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
        }`}>
          {val} devices
        </span>
      )
    },
    {
      key: 'devices',
      label: 'Serial Numbers',
      sortable: false,
      render: (val) => (
        <div className="max-w-xs">
          {val && val.length > 0 ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {val.slice(0, 3).join(', ')}
              {val.length > 3 && ` +${val.length - 3} more`}
            </span>
          ) : '-'}
        </div>
      )
    }
  ]

  // Filter definitions
  const minCountOptions = ['2', '3', '4', '5', '10']

  const filterDefs = [
    { key: 'location', label: 'Location', options: filterOptions.user_locations || [], placeholder: 'All Locations' },
    { key: 'min_count', label: 'Min Devices', options: minCountOptions, placeholder: '2+ devices' }
  ]

  return (
    <ReportTable
      title="Multiple Devices"
      description="Users with more than one device assigned"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name or email..."
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
      emptyMessage="No users with multiple devices found"
    />
  )
}
