import ReportTable from '../../components/ReportTable'
import useReportQuery from '../../hooks/useReportQuery'

export default function NoChromebook() {
  const report = useReportQuery('no-chromebook', {
    defaultFilters: {
      location: null,
      grade: null
    },
    defaultSort: 'full_name',
    defaultOrder: 'asc',
    hasSearch: true,
    exportFilename: 'students_no_chromebook'
  })

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
    { key: 'location', label: 'Location', options: report.filterOptions.user_locations || [], placeholder: 'All Locations' },
    { key: 'grade', label: 'Grade', options: report.filterOptions.grades || [], placeholder: 'All Grades' }
  ]

  return (
    <ReportTable
      title="Students Without Chromebook"
      description="Active students who do not have a device assigned in IIQ"
      data={report.data}
      columns={columns}
      filters={filterDefs}
      filterValues={report.filters}
      onFilterChange={report.handleFilterChange}
      searchValue={report.search}
      onSearchChange={report.setSearch}
      searchPlaceholder="Search by name, email, or ID..."
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
      emptyMessage="All active students have devices assigned"
    />
  )
}
