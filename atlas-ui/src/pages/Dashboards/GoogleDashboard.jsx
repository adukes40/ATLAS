import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Chrome, ArrowLeft, Loader2, Monitor, AlertTriangle,
  CheckCircle, XCircle, Clock
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer
} from 'recharts'

// Chart colors matching our theme
const COLORS = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  slate: '#64748b',
  indigo: '#6366f1'
}

const STATUS_COLORS = {
  active: COLORS.emerald,
  disabled: COLORS.red,
  provisioned: COLORS.blue,
  other: COLORS.slate
}

// Get color based on AUE year
const getAueColor = (year) => {
  const y = parseInt(year)
  if (y <= 2024) return COLORS.red      // Expired
  if (y <= 2026) return COLORS.amber    // Soon
  if (y <= 2028) return COLORS.blue     // Upcoming
  return COLORS.emerald                 // Good (2029+)
}

export default function GoogleDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/dashboards/google')
        setStats(response.data)
      } catch (err) {
        console.error('Failed to fetch Google stats:', err)
        setError('Failed to load Google dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Transform status data for pie chart
  const statusData = stats ? [
    { name: 'Active', value: stats.status.active, color: STATUS_COLORS.active },
    { name: 'Disabled', value: stats.status.disabled, color: STATUS_COLORS.disabled },
    { name: 'Provisioned', value: stats.status.provisioned, color: STATUS_COLORS.provisioned },
    { name: 'Other', value: stats.status.other, color: STATUS_COLORS.other }
  ].filter(d => d.value > 0) : []

  // Transform AUE data for vertical bar chart
  const aueData = stats?.aue_by_year?.map(item => ({
    year: item.year,
    total: item.total,
    models: item.models,
    color: getAueColor(item.year)
  })) || []

  // Calculate expired count (years <= 2024)
  const expiredCount = aueData
    .filter(d => parseInt(d.year) <= 2024)
    .reduce((sum, d) => sum + d.total, 0)

  // Custom tooltip for status pie chart
  const StatusTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {payload[0].name}: <span className="font-bold">{payload[0].value.toLocaleString()}</span>
          </p>
        </div>
      )
    }
    return null
  }

  // Custom tooltip for AUE bar chart with model breakdown
  const AueTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">
            {data.year}: {data.total.toLocaleString()} devices
          </p>
          <div className="space-y-1">
            {data.models.map((model, idx) => (
              <div key={idx} className="flex justify-between gap-4 text-xs">
                <span className="text-slate-600 dark:text-slate-400 truncate">{model.model}</span>
                <span className="font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{model.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link to="/dashboards" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboards
        </Link>
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/dashboards" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboards
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Chrome className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Google Admin Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Chromebook enrollment, status, and AUE tracking</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Monitor className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Devices</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.total.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.status.active.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.total > 0 ? Math.round((stats.status.active / stats.total) * 100) : 0}% of fleet</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disabled</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.status.disabled.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expired AUE</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{expiredCount.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">past end of life</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Device Status Distribution</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                  animationDuration={0}
                  animationBegin={0}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} style={{ transition: 'none' }} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No status data available
            </div>
          )}
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {statusData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AUE Vertical Bar Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">AUE by Year (Hover for Models)</h3>
          {aueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aueData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                />
                <Tooltip content={<AueTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={50}>
                  {aueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No AUE data available
            </div>
          )}
          {/* AUE Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.red }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Expired (&le;2024)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.amber }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Soon (2025-26)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.blue }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Upcoming (2027-28)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.emerald }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Good (2029+)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Data Freshness</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Dashboard data syncs nightly at 2 AM. Hover over any bar to see the top 5 models for that AUE year.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
