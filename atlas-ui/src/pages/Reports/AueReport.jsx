import ReportTable from '../../components/ReportTable'
import useReportQuery from '../../hooks/useReportQuery'

export default function AueReport() {
  const report = useReportQuery('aue-eol', {
    defaultFilters: {
      aue_year: null,
      iiq_status: null,
      google_status: null,
      model: null
    },
    defaultSort: 'aue_date',
    defaultOrder: 'asc',
    hasSearch: false,
    exportFilename: 'aue_eol_report'
  })

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
    { key: 'aue_year', label: 'AUE Year', options: report.filterOptions.aue_years || [], placeholder: 'All Years' },
    { key: 'iiq_status', label: 'IIQ Status', options: report.filterOptions.iiq_statuses || [], placeholder: 'All IIQ Statuses' },
    { key: 'google_status', label: 'Google Status', options: report.filterOptions.google_statuses || [], placeholder: 'All Google Statuses' },
    { key: 'model', label: 'Model', options: report.filterOptions.models || [], placeholder: 'All Models' }
  ]

  return (
    <ReportTable
      title="AUE / End-of-Life Report"
      description="Chromebooks sorted by Auto Update Expiration date"
      data={report.data}
      columns={columns}
      filters={filterDefs}
      filterValues={report.filters}
      onFilterChange={report.handleFilterChange}
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
      emptyMessage="No devices found with AUE data"
    />
  )
}
