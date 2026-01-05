import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function NoChromebook() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    location: null,
    grade: null
  })
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState('full_name')
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
      appendFilter(params, 'location', filters.location)
      appendFilter(params, 'grade', filters.grade)
      if (search) params.append('search', search)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/no-chromebook?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch no chromebook report:', err)
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
    appendFilter(params, 'grade', filters.grade)

    try {
      const res = await axios.get(`/api/reports/no-chromebook/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `students_no_chromebook_${new Date().toISOString().slice(0, 10)}.csv`)
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
    { key: 'school_id', label: 'School ID' },
    { key: 'email', label: 'Email' },
    { key: 'grade', label: 'Grade' },
    { key: 'location', label: 'Location' },
    { key: 'homeroom', label: 'Homeroom' }
  ]

  // Filter definitions
  const filterDefs = [
    { key: 'location', label: 'Location', options: filterOptions.user_locations || [], placeholder: 'All Locations' },
    { key: 'grade', label: 'Grade', options: filterOptions.grades || [], placeholder: 'All Grades' }
  ]

  return (
    <ReportTable
      title="Students Without Chromebook"
      description="Active students who do not have a device assigned in IIQ"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, email, or ID..."
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
      emptyMessage="All active students have devices assigned"
    />
  )
}
