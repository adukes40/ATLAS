import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Clipboard, ArrowLeft, Loader2, Package, CheckCircle,
  Users, DollarSign, AlertTriangle, Clock
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
  indigo: '#6366f1',
  cyan: '#06b6d4',
  pink: '#ec4899',
  orange: '#f97316'
}

const STATUS_COLORS = {
  in_service: COLORS.emerald,
  in_storage: COLORS.amber,
  other: COLORS.slate
}

const ROLE_COLORS = {
  Student: COLORS.blue,
  Faculty: COLORS.purple,
  Staff: COLORS.indigo,
  'No Access': COLORS.slate,
  Agent: COLORS.cyan,
  Other: COLORS.orange
}

// Color palette for location/model bars
const BAR_COLORS = [
  COLORS.blue, COLORS.emerald, COLORS.purple, COLORS.indigo,
  COLORS.cyan, COLORS.pink, COLORS.orange, COLORS.amber,
  COLORS.slate, COLORS.red
]

export default function IIQDashboard() {
  const [stats, setStats] = useState(null)
  const [ticketStats, setTicketStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch both stats in parallel
        const [iiqResponse, ticketResponse] = await Promise.all([
          axios.get('/api/dashboards/iiq'),
          axios.get('/api/dashboards/iiq/tickets')
        ])
        setStats(iiqResponse.data)
        setTicketStats(ticketResponse.data)
      } catch (err) {
        console.error('Failed to fetch IIQ stats:', err)
        setError('Failed to load IIQ dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Transform status data for pie chart
  const statusData = stats ? [
    { name: 'In Service', value: stats.status.in_service, color: STATUS_COLORS.in_service },
    { name: 'In Storage', value: stats.status.in_storage, color: STATUS_COLORS.in_storage },
    { name: 'Other', value: stats.status.other, color: STATUS_COLORS.other }
  ].filter(d => d.value > 0) : []

  // Transform role data for pie chart
  const roleData = stats?.by_role?.map((item, idx) => ({
    name: item.role,
    value: item.count,
    color: ROLE_COLORS[item.role] || BAR_COLORS[idx % BAR_COLORS.length]
  })) || []

  // Transform location data for bar chart (top 5, using abbreviated names from API)
  const locationData = stats?.by_location?.slice(0, 5).map((item, idx) => ({
    name: item.name,  // Already abbreviated from API
    fullName: item.fullName || item.name,
    count: item.count,
    color: BAR_COLORS[idx % BAR_COLORS.length]
  })) || []

  // Transform model data for horizontal bar chart (top 5)
  const modelData = stats?.by_model?.slice(0, 5).map((item, idx) => ({
    name: item.model.length > 20 ? item.model.substring(0, 20) + '...' : item.model,
    fullName: item.model,
    count: item.count,
    color: BAR_COLORS[idx % BAR_COLORS.length]
  })) || []

  // Custom tooltip for pie charts
  const PieTooltip = ({ active, payload }) => {
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

  // Custom tooltip for bar charts
  const BarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {data.fullName || data.name}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {data.count.toLocaleString()} devices
          </p>
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
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Clipboard className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Incident IQ Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Asset status, assignments, and user fee tracking</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Package className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Assets</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.total.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Service</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.status.in_service.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.total > 0 ? Math.round((stats.status.in_service / stats.total) * 100) : 0}% of fleet</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Chromebook</span>
          </div>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.students?.without_chromebook || 0}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.students?.with_chromebook?.toLocaleString() || 0} students have one</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <DollarSign className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding Fees</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">${stats.fees.total_outstanding.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{stats.fees.users_with_balance} users with balance</p>
        </div>
      </div>

      {/* Charts Row 1 */}
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
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} isAnimationActive={false} />
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

        {/* Location Table - All locations */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Devices by Location</h3>
            <span className="text-xs text-slate-400">{stats?.by_location?.length || 0} locations</span>
          </div>
          {stats?.by_location?.length > 0 ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-xs font-bold text-slate-400 uppercase">Location</th>
                    <th className="text-right py-2 px-2 text-xs font-bold text-slate-400 uppercase">Devices</th>
                    <th className="text-right py-2 px-2 text-xs font-bold text-slate-400 uppercase w-24">%</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_location.map((loc, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300" title={loc.fullName}>
                        {loc.name}
                      </td>
                      <td className="py-2 px-2 text-right font-medium text-slate-800 dark:text-slate-100">
                        {loc.count.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, (loc.count / stats.total) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">
                            {stats.total > 0 ? ((loc.count / stats.total) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No location data available
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Pie Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Assignment by Role</h3>
          {roleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={roleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {roleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No role data available
            </div>
          )}
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {roleData.slice(0, 6).map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model Bar Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Top Models</h3>
          {modelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={modelData} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={115} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {modelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No model data available
            </div>
          )}
        </div>
      </div>

      {/* Users with Outstanding Fees */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Users with Outstanding Fees</h3>
          <span className="text-xs text-slate-400">Top 20 by balance</span>
        </div>
        {stats.fees.top_users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Role</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-slate-400 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stats.fees.top_users.map((user, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-100">{user.name}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'Student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                        user.role === 'Faculty' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-red-600 dark:text-red-400">
                      ${user.balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400">
            No users with outstanding fees
          </div>
        )}
      </div>

      {/* Ticket Stats Row */}
      {ticketStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Tickets</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{ticketStats.open_tickets}</p>
            <p className="text-xs text-slate-400 mt-1">currently open</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">School Year</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{ticketStats.school_year_tickets}+</p>
            <p className="text-xs text-slate-400 mt-1">{ticketStats.school_year} tickets</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Clock className="h-4 w-4 text-slate-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">All Time</span>
            </div>
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{ticketStats.total_all_time.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">total tickets</p>
          </div>
        </div>
      )}

      {/* Data Freshness */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Data Freshness</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Asset data syncs nightly at 3 AM. Ticket counts are live from IIQ API. Fee balances are aggregated by user.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
