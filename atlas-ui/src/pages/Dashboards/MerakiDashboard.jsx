import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Wifi, ArrowLeft, Loader2, Radio, Signal, Clock, Info
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

// Color palette for bars
const BAR_COLORS = [
  COLORS.purple, COLORS.blue, COLORS.emerald, COLORS.indigo,
  COLORS.cyan, COLORS.pink, COLORS.orange, COLORS.amber,
  COLORS.slate, COLORS.red
]

export default function MerakiDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/dashboards/meraki')
        setStats(response.data)
      } catch (err) {
        console.error('Failed to fetch Meraki stats:', err)
        setError('Failed to load Meraki dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Transform AP data for bar chart
  const apData = stats?.top_aps?.map((item, idx) => ({
    name: item.name.length > 18 ? item.name.substring(0, 18) + '...' : item.name,
    fullName: item.name,
    count: item.count,
    color: BAR_COLORS[idx % BAR_COLORS.length]
  })) || []

  // Transform SSID data for pie chart
  const ssidData = stats?.ssids?.map((item, idx) => ({
    name: item.name,
    value: item.count,
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
            {data.count.toLocaleString()} clients
          </p>
        </div>
      )
    }
    return null
  }

  // Format relative time
  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Unknown'
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
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
              <Wifi className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Meraki Network Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Wireless clients, AP distribution, and network activity</p>
            </div>
          </div>
        </div>
      </div>

      {/* On-Demand Data Notice */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">On-Demand Data</p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Network data is populated on-demand from Device 360 lookups. This dashboard shows cached client data from recent searches, not real-time network state.
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Wifi className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cached Clients</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.total_cached.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">from Device 360 lookups</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Radio className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique APs</span>
          </div>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.unique_aps}</p>
          <p className="text-xs text-slate-400 mt-1">access points seen</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Signal className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique SSIDs</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.unique_ssids}</p>
          <p className="text-xs text-slate-400 mt-1">wireless networks</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AP Bar Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Clients by Access Point</h3>
          {apData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={apData} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={95} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {apData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No AP data available
            </div>
          )}
        </div>

        {/* SSID Pie Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Clients by SSID</h3>
          {ssidData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={ssidData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {ssidData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No SSID data available
            </div>
          )}
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {ssidData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Clients Table */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Recent Network Activity</h3>
          <span className="text-xs text-slate-400">Last 10 devices seen</span>
        </div>
        {stats.recent_clients && stats.recent_clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">MAC Address</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">IP Address</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">Access Point</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase">SSID</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-slate-400 uppercase">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_clients.map((client, idx) => (
                  <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-100 text-xs">{client.mac_address}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400 text-xs">{client.ip_address || '-'}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Radio className="h-3 w-3 text-purple-500" />
                        {client.ap_name || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {client.ssid || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(client.last_seen)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400">
            No recent client data available. Use Device 360 to look up devices and populate the network cache.
          </div>
        )}
      </div>

      {/* Data Source Note */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Wifi className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">About This Dashboard</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Unlike Google and IIQ data which syncs nightly, Meraki network data is fetched on-demand when you look up a device in Device 360.
              This keeps API usage efficient while still providing valuable network location data. The cache stores the last known AP and SSID for each device MAC address.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
