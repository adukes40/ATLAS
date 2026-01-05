import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function InfrastructureInventory() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    product_type: null,
    network: null,
    status: null,
    model: null
  })
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(100)

  // Fetch filter options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await axios.get('/api/reports/filters/meraki-options')
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
      appendFilter(params, 'product_type', filters.product_type)
      appendFilter(params, 'network', filters.network)
      appendFilter(params, 'status', filters.status)
      appendFilter(params, 'model', filters.model)
      if (search) params.append('search', search)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/infrastructure-inventory?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch infrastructure inventory:', err)
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

  // Handle search - reset to page 0
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
    appendFilter(params, 'product_type', filters.product_type)
    appendFilter(params, 'network', filters.network)
    appendFilter(params, 'status', filters.status)
    appendFilter(params, 'model', filters.model)
    if (search) params.append('search', search)

    try {
      const res = await axios.get(`/api/reports/infrastructure-inventory/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `infrastructure_inventory_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Failed to export CSV')
    }
  }

  // Format status with color
  const formatStatus = (status) => {
    if (!status) return '-'
    const colors = {
      online: 'text-emerald-600 dark:text-emerald-400',
      offline: 'text-red-600 dark:text-red-400',
      dormant: 'text-amber-600 dark:text-amber-400',
      alerting: 'text-orange-600 dark:text-orange-400'
    }
    return (
      <span className={colors[status] || 'text-slate-600 dark:text-slate-400'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  // Format product type with badge
  const formatProductType = (type) => {
    if (!type) return '-'
    const colors = {
      wireless: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      switch: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      appliance: 'bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-300'
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-slate-100 text-slate-700'}`}>
        {type === 'wireless' ? 'AP' : type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    )
  }

  // Column definitions
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'serial', label: 'Serial' },
    { key: 'model', label: 'Model' },
    { key: 'product_type', label: 'Type', render: formatProductType },
    { key: 'status', label: 'Status', render: formatStatus },
    { key: 'network_name', label: 'Network' },
    { key: 'lan_ip', label: 'LAN IP', render: (val) => val || '-' },
    { key: 'firmware', label: 'Firmware', render: (val) => val || '-' },
    { key: 'mac', label: 'MAC', render: (val) => val || '-' }
  ]

  // Filter definitions
  const filterDefs = [
    { key: 'product_type', label: 'Type', options: filterOptions.product_types || [], placeholder: 'All Types' },
    { key: 'network', label: 'Network', options: filterOptions.networks || [], placeholder: 'All Networks' },
    { key: 'status', label: 'Status', options: filterOptions.statuses || [], placeholder: 'All Statuses' },
    { key: 'model', label: 'Model', options: filterOptions.models || [], placeholder: 'All Models' }
  ]

  return (
    <ReportTable
      title="Infrastructure Inventory"
      description="All Meraki network devices (APs and switches)"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, serial, model, or MAC..."
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
      emptyMessage="No infrastructure devices found matching your filters"
    />
  )
}
