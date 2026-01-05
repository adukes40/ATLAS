import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  Wifi, ArrowLeft, Loader2, Radio, Signal, Clock, Server,
  CheckCircle, AlertTriangle, XCircle, Activity, Users
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, LabelList
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

// Color palette for charts
const CHART_COLORS = [
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

  // Transform SSID data for pie chart
  const ssidData = stats?.clients?.by_ssid?.map((item, idx) => ({
    name: item.name,
    value: item.count,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  })) || []

  // Transform group policy data for pie chart
  const groupData = stats?.clients_by_group?.map((item, idx) => ({
    name: item.name,
    value: item.count,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  })) || []

  // Transform site data for bar chart - ALL sites
  const siteData = stats?.by_site?.map((item, idx) => ({
    name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
    fullName: item.name,
    aps: item.aps,
    switches: item.switches,
    total: item.total
  })) || []

  // Transform AP firmware data for donut chart
  const apFirmwareData = stats?.firmware?.aps?.map((item, idx) => ({
    name: item.version,
    value: item.count,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  })) || []

  // Transform switch firmware data for donut chart
  const switchFirmwareData = stats?.firmware?.switches?.map((item, idx) => ({
    name: item.version,
    value: item.count,
    color: CHART_COLORS[idx % CHART_COLORS.length]
  })) || []

  // Transform top APs data for bar chart
  const topApsData = stats?.top_aps?.map((item, idx) => ({
    name: item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name,
    fullName: item.name,
    count: item.count,
    color: CHART_COLORS[idx % CHART_COLORS.length]
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
          {data.aps !== undefined ? (
            <>
              <p className="text-sm text-purple-500 mt-1">{data.aps} APs</p>
              <p className="text-sm text-blue-500">{data.switches} Switches</p>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {data.count?.toLocaleString() || data.total?.toLocaleString()} clients
            </p>
          )}
        </div>
      )
    }
    return null
  }

  // Format relative time
  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Never'
    let dateStr = isoString
    if (!isoString.endsWith('Z') && !isoString.includes('+')) {
      dateStr = isoString + 'Z'
    }
    const date = new Date(dateStr)
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

  const infra = stats?.infrastructure || {}
  const statusData = infra.status || {}

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
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Meraki Infrastructure Dashboard</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Network infrastructure, clients, and device health
                <span className="ml-2 text-xs text-slate-400">
                  Last sync: {formatRelativeTime(stats?.last_sync?.devices)}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Infrastructure Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* APs */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">APs</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{infra.total_aps?.toLocaleString()}</p>
        </div>

        {/* Switches */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Switches</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{infra.total_switches?.toLocaleString()}</p>
        </div>

        {/* Devices Online */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Devices Online</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{statusData.online?.toLocaleString()}</p>
          <p className="text-xs text-slate-400">APs + Switches</p>
        </div>

        {/* Dormant */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dormant</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{statusData.dormant?.toLocaleString()}</p>
        </div>

        {/* Offline */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offline</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{statusData.offline?.toLocaleString()}</p>
        </div>

        {/* Clients */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clients</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats?.clients?.total?.toLocaleString()}</p>
          <p className="text-xs text-slate-400">24h window</p>
        </div>
      </div>

      {/* Infrastructure by Site - Full Width */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Infrastructure by Site</h3>
        {siteData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(400, siteData.length * 28)}>
            <BarChart data={siteData} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={115} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="aps" name="APs" fill={COLORS.purple} stackId="stack">
                <LabelList dataKey="aps" position="center" fill="#ffffff" fontSize={10} />
              </Bar>
              <Bar dataKey="switches" name="Switches" fill={COLORS.blue} stackId="stack">
                <LabelList dataKey="switches" position="center" fill="#ffffff" fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-400">
            No site data available
          </div>
        )}
      </div>

      {/* Charts Row 1: SSID Distribution + Group Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Distribution by SSID */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Clients by SSID</h3>
          {ssidData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ssidData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={85}
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
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {ssidData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No SSID data available
            </div>
          )}
        </div>

        {/* Clients by Group Policy */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Clients by Group Policy (iPSK)</h3>
          {groupData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={groupData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {groupData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} isAnimationActive={false} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-2 max-h-24 overflow-y-auto">
                {groupData.slice(0, 10).map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
                  </div>
                ))}
                {groupData.length > 10 && (
                  <span className="text-xs text-slate-400">+{groupData.length - 10} more</span>
                )}
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No group policy data available
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2: Firmware Versions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AP Firmware */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">AP Firmware Versions</h3>
          {apFirmwareData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={apFirmwareData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {apFirmwareData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} isAnimationActive={false} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {apFirmwareData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400">
              No firmware data available
            </div>
          )}
        </div>

        {/* Switch Firmware */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Switch Firmware Versions</h3>
          {switchFirmwareData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={switchFirmwareData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {switchFirmwareData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} isAnimationActive={false} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {switchFirmwareData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400">
              No firmware data available
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 3: Top Devices + Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top APs by Client Count */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Top APs by Client Count</h3>
          <p className="text-xs text-slate-400 -mt-2 mb-4">Access points with the most connected wireless clients</p>
          {topApsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topApsData} layout="vertical" margin={{ top: 5, right: 40, left: 110, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={105} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {topApsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList dataKey="count" position="right" fill="#64748b" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No AP client data available
            </div>
          )}
        </div>

        {/* Model Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Device Models</h3>
          <div className="grid grid-cols-2 gap-6">
            {/* AP Models */}
            <div>
              <h4 className="text-xs font-semibold text-purple-500 mb-3 flex items-center gap-1.5">
                <Radio className="h-3 w-3" /> Access Points
              </h4>
              <div className="space-y-2">
                {stats?.models?.aps?.map((item) => (
                  <div key={item.model} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.model}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Switch Models */}
            <div>
              <h4 className="text-xs font-semibold text-blue-500 mb-3 flex items-center gap-1.5">
                <Server className="h-3 w-3" /> Switches
              </h4>
              <div className="space-y-2">
                {stats?.models?.switches?.map((item) => (
                  <div key={item.model} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.model}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Networks Count */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Wifi className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Network Summary</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {infra.networks} Meraki networks across {stats?.by_site?.length || 0} sites.
                Data syncs nightly at 4 AM from Meraki Dashboard API.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Last device sync</p>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {formatRelativeTime(stats?.last_sync?.devices)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
