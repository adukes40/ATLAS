import { useState, useRef, useEffect } from 'react'
import {
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Download, Loader2, Search, X, Filter, Check
} from 'lucide-react'

// Multi-Select Dropdown Component
// value format: { values: string[], exclude: boolean } or null
function MultiSelectDropdown({ label, options, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Parse value - can be array (legacy) or object with values/exclude
  const parseValue = (val) => {
    if (!val) return { values: [], exclude: false }
    if (Array.isArray(val)) return { values: val, exclude: false }
    return { values: val.values || [], exclude: val.exclude || false }
  }

  const { values: selectedValues, exclude: isExclude } = parseValue(value)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (opt) => {
    let newValues
    if (selectedValues.includes(opt)) {
      newValues = selectedValues.filter(v => v !== opt)
    } else {
      newValues = [...selectedValues, opt]
    }

    if (newValues.length === 0) {
      onChange(null)
    } else {
      onChange({ values: newValues, exclude: isExclude })
    }
  }

  const toggleExclude = (e) => {
    e.stopPropagation()
    if (selectedValues.length > 0) {
      onChange({ values: selectedValues, exclude: !isExclude })
    }
  }

  const clearSelection = (e) => {
    e.stopPropagation()
    onChange(null)
  }

  const displayText = selectedValues.length === 0
    ? (placeholder || 'All')
    : selectedValues.length === 1
      ? (isExclude ? `Not: ${selectedValues[0]}` : selectedValues[0])
      : `${isExclude ? 'Exclude ' : ''}${selectedValues.length} selected`

  return (
    <div className="flex flex-col gap-1.5 relative" ref={dropdownRef}>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-10 px-3 rounded-lg border-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-sm flex items-center justify-between gap-2 min-w-[200px] ${
          isExclude && selectedValues.length > 0
            ? 'border-red-300 dark:border-red-600'
            : 'border-slate-200 dark:border-slate-600'
        }`}
      >
        <span className={`truncate ${selectedValues.length === 0 ? 'text-slate-400 dark:text-slate-500' : isExclude ? 'text-red-600 dark:text-red-400' : ''}`}>
          {displayText}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedValues.length > 0 && (
            <span
              onClick={clearSelection}
              className="hover:bg-slate-200 dark:hover:bg-slate-600 rounded p-0.5"
            >
              <X className="h-3 w-3 text-slate-400" />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-w-[400px] bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-50">
          {/* Include/Exclude Toggle */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Mode</span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: false }) }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  !isExclude
                    ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                Include
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); if (!isExclude && selectedValues.length > 0) onChange({ values: selectedValues, exclude: true }) }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  isExclude
                    ? 'bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                Exclude
              </button>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No options</div>
            ) : (
              options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center gap-3"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedValues.includes(opt)
                      ? isExclude
                        ? 'bg-red-500 border-red-500'
                        : 'bg-blue-500 border-blue-500'
                      : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {selectedValues.includes(opt) && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <span className="text-slate-700 dark:text-slate-200 whitespace-nowrap">{opt}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Search Input Component
function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
        Search
      </label>
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 h-4 w-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Search...'}
          className="w-full h-10 pl-11 pr-10 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// Main ReportTable Component
export default function ReportTable({
  title,
  description,
  data,
  columns,
  filters,
  filterValues,
  onFilterChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortColumn,
  sortOrder,
  onSort,
  page,
  totalPages,
  total,
  onPageChange,
  limit = 100,
  onLimitChange,
  loading,
  onExportCSV,
  exportFileName,
  customRowRender,
  emptyMessage
}) {
  // Handle column sort
  const handleSort = (column) => {
    if (column.sortable === false) return
    if (sortColumn === column.key) {
      onSort(column.key, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(column.key, 'asc')
    }
  }

  // Clear all filters
  const clearFilters = () => {
    Object.keys(filterValues).forEach((key) => {
      onFilterChange(key, null)
    })
    if (onSearchChange) onSearchChange('')
  }

  const hasActiveFilters = Object.values(filterValues).some(v => v) || (searchValue && searchValue.length > 0)

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      {/* Header - Fixed */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
          )}
        </div>
        {onExportCSV && (
          <button
            onClick={onExportCSV}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Filters Container - Fixed */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 shadow-sm mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          {/* Search Field */}
          {onSearchChange && (
            <SearchInput
              value={searchValue}
              onChange={onSearchChange}
              placeholder={searchPlaceholder}
            />
          )}

          {/* Filter Dropdowns */}
          {filters.map((filter) => (
            <MultiSelectDropdown
              key={filter.key}
              label={filter.label}
              options={filter.options}
              value={filterValues[filter.key]}
              onChange={(val) => onFilterChange(filter.key, val)}
              placeholder={filter.placeholder}
            />
          ))}
        </div>
      </div>

      {/* Results count - Fixed */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </span>
          ) : (
            <span>
              Showing <span className="text-slate-800 dark:text-slate-200">{data.length > 0 ? page * limit + 1 : 0} - {Math.min((page + 1) * limit, total)}</span> of <span className="text-slate-800 dark:text-slate-200">{total.toLocaleString()}</span> results
            </span>
          )}
        </div>
      </div>

      {/* Table Container - Scrollable with sticky header */}
      <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-700 dark:bg-slate-900 sticky top-0 z-10">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable !== false && handleSort(col)}
                    className={`text-left py-3.5 px-4 font-semibold text-white ${
                      col.sortable !== false ? 'cursor-pointer hover:bg-slate-600 dark:hover:bg-slate-800 select-none transition-colors' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable !== false && sortColumn === col.key && (
                        sortOrder === 'asc'
                          ? <ChevronUp className="h-4 w-4 text-blue-400" />
                          : <ChevronDown className="h-4 w-4 text-blue-400" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="py-16 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-16 text-center text-slate-500 dark:text-slate-400">
                    {emptyMessage || 'No results found'}
                  </td>
                </tr>
              ) : customRowRender ? (
                data.map((row, idx) => customRowRender(row, idx))
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className="py-3 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {col.render ? col.render(row[col.key], row) : row[col.key] || '-'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination - Fixed at bottom */}
      {(totalPages > 1 || onLimitChange) && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border-2 border-slate-200 dark:border-slate-700 p-3 shadow-sm mt-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Page <span className="text-slate-800 dark:text-slate-200">{page + 1}</span> of <span className="text-slate-800 dark:text-slate-200">{totalPages.toLocaleString()}</span>
            </div>
            {onLimitChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">Show:</span>
                <select
                  value={limit || 100}
                  onChange={(e) => onLimitChange(Number(e.target.value))}
                  className="h-9 px-2 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <span className="text-sm text-slate-500 dark:text-slate-400">per page</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="flex items-center gap-1 px-4 py-2 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
