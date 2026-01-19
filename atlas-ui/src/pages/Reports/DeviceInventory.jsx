import { useNavigate } from 'react-router-dom'
import ReportTable from '../../components/ReportTable'
import useReportQuery from '../../hooks/useReportQuery'

export default function DeviceInventory() {
  const navigate = useNavigate()

  const handleRowClick = (row) => {
    if (row.serial_number) {
      navigate(`/?serial=${encodeURIComponent(row.serial_number)}`)
    }
  }

  const report = useReportQuery('device-inventory', {
    defaultFilters: {
      iiq_status: null,
      google_status: null,
      location: null,
      model: null,
      grade: null
    },
    defaultSort: 'asset_tag',
    defaultOrder: 'asc',
    hasSearch: true,
    exportFilename: 'device_inventory'
  })

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
    { key: 'iiq_status', label: 'IIQ Status', options: report.filterOptions.iiq_statuses || [], placeholder: 'All IIQ Statuses' },
    { key: 'google_status', label: 'Google Status', options: report.filterOptions.google_statuses || [], placeholder: 'All Google Statuses' },
    { key: 'location', label: 'Location', options: report.filterOptions.locations || [], placeholder: 'All Locations' },
    { key: 'model', label: 'Model', options: report.filterOptions.models || [], placeholder: 'All Models' },
    { key: 'grade', label: 'Grade', options: report.filterOptions.grades || [], placeholder: 'All Grades' }
  ]

  return (
    <ReportTable
      title="Device Inventory"
      description="All devices with assigned user information"
      data={report.data}
      columns={columns}
      filters={filterDefs}
      filterValues={report.filters}
      onFilterChange={report.handleFilterChange}
      searchValue={report.search}
      onSearchChange={report.setSearch}
      searchPlaceholder="Search by serial, tag, or user..."
      sortColumn={report.sortColumn}
      sortOrder={report.sortOrder}
      onSort={report.handleSort}
      page={report.page}
      totalPages={report.totalPages}
      total={report.total}
      onPageChange={report.setPage}
      limit={report.limit}
      onLimitChange={report.handleLimitChange}
      loading={report.loading}
      onExportCSV={report.handleExportCSV}
      emptyMessage="No devices found matching your filters"
      onRowClick={handleRowClick}
    />
  )
}
