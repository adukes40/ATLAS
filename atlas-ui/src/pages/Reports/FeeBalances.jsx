import ReportTable from '../../components/ReportTable'
import useReportQuery from '../../hooks/useReportQuery'

export default function FeeBalances() {
  const report = useReportQuery('fee-balances', {
    defaultFilters: {
      location: null,
      grade: null,
      min_balance: null
    },
    defaultSort: 'fee_balance',
    defaultOrder: 'desc',
    hasSearch: true,
    exportFilename: 'fee_balances'
  })

  // Format currency
  const formatCurrency = (val) => {
    if (!val && val !== 0) return '-'
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Column definitions
  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'school_id', label: 'School ID' },
    { key: 'email', label: 'Email' },
    { key: 'grade', label: 'Grade' },
    { key: 'location', label: 'Location' },
    {
      key: 'fee_balance',
      label: 'Balance',
      render: (val) => (
        <span className={val > 100 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
          {formatCurrency(val)}
        </span>
      )
    },
    {
      key: 'fee_past_due',
      label: 'Past Due',
      render: (val) => (
        <span className={val > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
          {formatCurrency(val)}
        </span>
      )
    }
  ]

  // Filter definitions
  const minBalanceOptions = ['25', '50', '100', '250', '500', '1000']

  const filterDefs = [
    { key: 'location', label: 'Location', options: report.filterOptions.user_locations || [], placeholder: 'All Locations' },
    { key: 'grade', label: 'Grade', options: report.filterOptions.grades || [], placeholder: 'All Grades' },
    { key: 'min_balance', label: 'Min Balance', options: minBalanceOptions, placeholder: 'Any Amount' }
  ]

  return (
    <ReportTable
      title="Fee Balances"
      description="Users with outstanding fee balances"
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
      emptyMessage="No users with outstanding fees"
    />
  )
}
