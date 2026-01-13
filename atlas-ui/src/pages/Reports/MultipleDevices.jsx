import ReportTable from '../../components/ReportTable'
import useReportQuery from '../../hooks/useReportQuery'

export default function MultipleDevices() {
  const report = useReportQuery('multiple-devices', {
    defaultFilters: {
      location: null,
      min_count: null
    },
    defaultSort: 'device_count',
    defaultOrder: 'desc',
    hasSearch: true,
    exportFilename: 'multiple_devices'
  })

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
    { key: 'location', label: 'Location', options: report.filterOptions.user_locations || [], placeholder: 'All Locations' },
    { key: 'min_count', label: 'Min Devices', options: minCountOptions, placeholder: '2+ devices' }
  ]

  return (
    <ReportTable
      title="Multiple Devices"
      description="Users with more than one device assigned"
      data={report.data}
      columns={columns}
      filters={filterDefs}
      filterValues={report.filters}
      onFilterChange={report.handleFilterChange}
      searchValue={report.search}
      onSearchChange={report.setSearch}
      searchPlaceholder="Search by name or email..."
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
      emptyMessage="No users with multiple devices found"
    />
  )
}
