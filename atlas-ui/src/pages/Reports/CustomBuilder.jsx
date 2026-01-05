import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  Database, Laptop, Users, Chrome, Wifi, ChevronRight,
  Loader2, Download, Search, X, ChevronUp, ChevronDown,
  ChevronLeft, Check
} from 'lucide-react'

// Data Source Card
function SourceCard({ icon: Icon, title, description, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${selected ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className={`font-medium ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-100'}`}>
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {selected && <Check className="h-5 w-5 text-blue-500" />}
      </div>
    </button>
  )
}

// Column Picker
function ColumnPicker({ columns, selected, onChange }) {
  const toggleColumn = (key) => {
    if (selected.includes(key)) {
      onChange(selected.filter(k => k !== key))
    } else {
      onChange([...selected, key])
    }
  }

  const selectAll = () => {
    onChange(columns.map(c => c.key))
  }

  const selectNone = () => {
    onChange([])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-800 dark:text-slate-100">Select Columns</h3>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Select All</button>
          <button onClick={selectNone} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">Clear</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {columns.map((col) => (
          <label
            key={col.key}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
              selected.includes(col.key)
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(col.key)}
              onChange={() => toggleColumn(col.key)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// Data source definitions
const DATA_SOURCES = [
  { key: 'iiq_assets', icon: Laptop, title: 'IIQ Assets', description: 'Device inventory with owner info' },
  { key: 'iiq_users', icon: Users, title: 'IIQ Users', description: 'Full user roster with fees' },
  { key: 'google_devices', icon: Chrome, title: 'Google Devices', description: 'Chromebook telemetry data' },
  { key: 'google_users', icon: Users, title: 'Google Users', description: 'Google Workspace accounts' },
  { key: 'network_cache', icon: Wifi, title: 'Network Cache', description: 'Device network locations' }
]

export default function CustomBuilder() {
  // Builder state
  const [step, setStep] = useState(1) // 1: source, 2: columns, 3: results
  const [selectedSource, setSelectedSource] = useState(null)
  const [availableColumns, setAvailableColumns] = useState([])
  const [selectedColumns, setSelectedColumns] = useState([])
  const [search, setSearch] = useState('')

  // Results state
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(0)
  const [sortColumn, setSortColumn] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [columnLabels, setColumnLabels] = useState({})

  // Fetch columns when source changes
  useEffect(() => {
    if (!selectedSource) return

    const fetchColumns = async () => {
      try {
        const res = await axios.get(`/api/reports/custom/columns/${selectedSource}`)
        setAvailableColumns(res.data.columns)
        // Auto-select first 5 columns
        setSelectedColumns(res.data.columns.slice(0, 5).map(c => c.key))
      } catch (err) {
        console.error('Failed to fetch columns:', err)
      }
    }
    fetchColumns()
  }, [selectedSource])

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!selectedSource || selectedColumns.length === 0) return

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('columns', selectedColumns.join(','))
      if (search) params.append('search', search)
      if (sortColumn) {
        params.append('sort', sortColumn)
        params.append('order', sortOrder)
      }
      params.append('page', page)
      params.append('limit', 100)

      const res = await axios.get(`/api/reports/custom/${selectedSource}?${params}`)
      setData(res.data.data)
      setTotal(res.data.total)
      setTotalPages(res.data.pages)
      setColumnLabels(res.data.column_labels)
    } catch (err) {
      console.error('Failed to fetch custom report:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedSource, selectedColumns, search, sortColumn, sortOrder, page])

  // Auto-fetch when on results step
  useEffect(() => {
    if (step === 3) {
      fetchData()
    }
  }, [step, fetchData])

  // Handle sort
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortOrder('asc')
    }
    setPage(0)
  }

  // Handle CSV export
  const handleExportCSV = async () => {
    const params = new URLSearchParams()
    params.append('columns', selectedColumns.join(','))
    if (search) params.append('search', search)

    try {
      const res = await axios.get(`/api/reports/custom/${selectedSource}/export/csv?${params}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `custom_${selectedSource}_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Failed to export CSV')
    }
  }

  // Step 1: Source Selection
  if (step === 1) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Custom Report Builder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Step 1: Select a data source</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DATA_SOURCES.map((source) => (
            <SourceCard
              key={source.key}
              icon={source.icon}
              title={source.title}
              description={source.description}
              selected={selectedSource === source.key}
              onClick={() => setSelectedSource(source.key)}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => setStep(2)}
            disabled={!selectedSource}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next: Select Columns
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Column Selection
  if (step === 2) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Custom Report Builder</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Step 2: Choose columns for {DATA_SOURCES.find(s => s.key === selectedSource)?.title}
          </p>
        </div>

        <ColumnPicker
          columns={availableColumns}
          selected={selectedColumns}
          onChange={setSelectedColumns}
        />

        <div className="flex justify-between">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={() => setStep(3)}
            disabled={selectedColumns.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Report
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Step 3: Results
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Custom Report: {DATA_SOURCES.find(s => s.key === selectedSource)?.title}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {selectedColumns.length} columns selected
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setStep(2)}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Edit Columns
          </button>
          <button
            onClick={handleExportCSV}
            disabled={loading || data.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search..."
          className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm"
        />
        {search && (
          <button onClick={() => { setSearch(''); setPage(0); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </span>
        ) : (
          <span>Showing {data.length > 0 ? page * 100 + 1 : 0} - {Math.min((page + 1) * 100, total)} of {total.toLocaleString()} results</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                {selectedColumns.map((col) => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none"
                  >
                    <div className="flex items-center gap-1">
                      {columnLabels[col] || col}
                      {sortColumn === col && (
                        sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={selectedColumns.length} className="py-12 text-center">
                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={selectedColumns.length} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    No results found
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {selectedColumns.map((col) => (
                      <td key={col} className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Page {page + 1} of {totalPages.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
