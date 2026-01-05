import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ReportTable from '../../components/ReportTable'

export default function FirmwareCompliance() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [filterOptions, setFilterOptions] = useState({})

  // Query state
  const [filters, setFilters] = useState({
    product_type: null,
    model: null,
    firmware: null,
    network: null
  })
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState('model')
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
      appendFilter(params, 'model', filters.model)
      appendFilter(params, 'firmware', filters.firmware)
      appendFilter(params, 'network', filters.network)
      if (search) params.append('search', search)
      params.append('sort', sortColumn)
      params.append('order', sortOrder)
      params.append('page', page)
      params.append('limit', limit)

      const res = await axios.get(`/api/reports/firmware-compliance?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
    } catch (err) {
      console.error('Failed to fetch firmware compliance:', err)
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
    appendFilter(params, 'model', filters.model)
    appendFilter(params, 'firmware', filters.firmware)
    appendFilter(params, 'network', filters.network)
    if (search) params.append('search', search)

    try {
      const res = await axios.get(`/api/reports/firmware-compliance/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `firmware_compliance_${new Date().toISOString().slice(0, 10)}.csv`)
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

  // Format firmware with truncation
  const formatFirmware = (firmware) => {
    if (!firmware) return '-'
    // Firmware strings can be long, show a shortened version
    if (firmware.length > 30) {
      return (
        <span title={firmware} className="cursor-help">
          {firmware.substring(0, 27)}...
        </span>
      )
    }
    return firmware
  }

  // Column definitions
  const columns = [
    { key: 'model', label: 'Model' },
    { key: 'firmware', label: 'Firmware', render: formatFirmware },
    { key: 'name', label: 'Device Name' },
    { key: 'serial', label: 'Serial' },
    { key: 'product_type', label: 'Type', render: formatProductType },
    { key: 'status', label: 'Status', render: formatStatus },
    { key: 'network_name', label: 'Network' }
  ]

  // Filter definitions
  const filterDefs = [
    { key: 'product_type', label: 'Type', options: filterOptions.product_types || [], placeholder: 'All Types' },
    { key: 'model', label: 'Model', options: filterOptions.models || [], placeholder: 'All Models' },
    { key: 'firmware', label: 'Firmware', options: filterOptions.firmwares || [], placeholder: 'All Firmwares' },
    { key: 'network', label: 'Network', options: filterOptions.networks || [], placeholder: 'All Networks' }
  ]

  return (
    <ReportTable
      title="Firmware Compliance"
      description="Device firmware versions for compliance tracking"
      data={data}
      columns={columns}
      filters={filterDefs}
      filterValues={filters}
      onFilterChange={handleFilterChange}
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by model, firmware, name, or serial..."
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
