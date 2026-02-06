import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  BarChart3, Loader2, Monitor, Users, AlertTriangle, CheckCircle,
  Chrome, Server, Wifi, Settings, XCircle, Package, DollarSign,
  Radio, Signal, Clock, Activity
} from 'lucide-react'
import { useIntegrations } from '../../context/IntegrationsContext'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, LabelList
} from 'recharts'

// ─── Platform Color System ───────────────────────────────────────────────────

const BORDER_COLORS = {
  blue: 'border-l-4 border-l-blue-500',
  emerald: 'border-l-4 border-l-emerald-500',
  purple: 'border-l-4 border-l-purple-500',
  amber: 'border-l-4 border-l-amber-500',
  rose: 'border-l-4 border-l-rose-500',
  cyan: 'border-l-4 border-l-cyan-500',
}

const DEFAULT_PLATFORM_COLORS = {
  iiq: 'blue',
  google: 'emerald',
  meraki: 'purple',
}

const getPlatformColor = (platform) => {
  try {
    const stored = localStorage.getItem('atlas_platform_colors')
    const colors = stored ? JSON.parse(stored) : {}
    return colors[platform] || DEFAULT_PLATFORM_COLORS[platform]
  } catch {
    return DEFAULT_PLATFORM_COLORS[platform]
  }
}

const COLOR_CLASSES = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-900/50',
    icon: 'text-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    hover: 'hover:border-blue-300 dark:hover:border-blue-700',
    stat: 'text-blue-600 dark:text-blue-400',
    tab: 'border-blue-500 text-blue-600 dark:text-blue-400',
    tabBg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-900/50',
    icon: 'text-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    hover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
    stat: 'text-emerald-600 dark:text-emerald-400',
    tab: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
    tabBg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-900/50',
    icon: 'text-purple-500',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    hover: 'hover:border-purple-300 dark:hover:border-purple-700',
    stat: 'text-purple-600 dark:text-purple-400',
    tab: 'border-purple-500 text-purple-600 dark:text-purple-400',
    tabBg: 'bg-purple-50 dark:bg-purple-950/30',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-900/50',
    icon: 'text-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    hover: 'hover:border-amber-300 dark:hover:border-amber-700',
    stat: 'text-amber-600 dark:text-amber-400',
    tab: 'border-amber-500 text-amber-600 dark:text-amber-400',
    tabBg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    border: 'border-rose-200 dark:border-rose-900/50',
    icon: 'text-rose-500',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    hover: 'hover:border-rose-300 dark:hover:border-rose-700',
    stat: 'text-rose-600 dark:text-rose-400',
    tab: 'border-rose-500 text-rose-600 dark:text-rose-400',
    tabBg: 'bg-rose-50 dark:bg-rose-950/30',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    border: 'border-cyan-200 dark:border-cyan-900/50',
    icon: 'text-cyan-500',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    hover: 'hover:border-cyan-300 dark:hover:border-cyan-700',
    stat: 'text-cyan-600 dark:text-cyan-400',
    tab: 'border-cyan-500 text-cyan-600 dark:text-cyan-400',
    tabBg: 'bg-cyan-50 dark:bg-cyan-950/30',
  },
}

// ─── Chart Color Constants ───────────────────────────────────────────────────

const CHART_COLORS = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  slate: '#64748b',
  indigo: '#6366f1',
  cyan: '#06b6d4',
  pink: '#ec4899',
  orange: '#f97316',
}

const CHART_PALETTE = [
  CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.purple, CHART_COLORS.indigo,
  CHART_COLORS.cyan, CHART_COLORS.pink, CHART_COLORS.orange, CHART_COLORS.amber,
  CHART_COLORS.slate, CHART_COLORS.red
]

// ─── Google Chart Helpers ────────────────────────────────────────────────────

const GOOGLE_STATUS_COLORS = {
  active: CHART_COLORS.emerald,
  disabled: CHART_COLORS.red,
  provisioned: CHART_COLORS.blue,
  other: CHART_COLORS.slate,
}

const getAueColor = (year) => {
  const y = parseInt(year)
  if (y <= 2024) return CHART_COLORS.red
  if (y <= 2026) return CHART_COLORS.amber
  if (y <= 2028) return CHART_COLORS.blue
  return CHART_COLORS.emerald
}

// ─── IIQ Chart Helpers ───────────────────────────────────────────────────────

const IIQ_STATUS_COLORS = {
  in_service: CHART_COLORS.emerald,
  in_storage: CHART_COLORS.amber,
  other: CHART_COLORS.slate,
}

const IIQ_ROLE_COLORS = {
  Student: CHART_COLORS.blue,
  Faculty: CHART_COLORS.purple,
  Staff: CHART_COLORS.indigo,
  'No Access': CHART_COLORS.slate,
  Agent: CHART_COLORS.cyan,
  Other: CHART_COLORS.orange,
}

// ─── Shared Tooltip Components ───────────────────────────────────────────────

const SharedPieTooltip = ({ active, payload }) => {
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

const SharedBarTooltip = ({ active, payload }) => {
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
            {(data.count ?? data.total)?.toLocaleString()} {data.aps !== undefined ? 'devices' : 'devices'}
          </p>
        )}
      </div>
    )
  }
  return null
}

// ─── Meraki Helpers ──────────────────────────────────────────────────────────

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

// ─── Tab Content Components ──────────────────────────────────────────────────

// ---------- Google Tab ----------

function GoogleTabContent({ data }) {
  if (!data) return null

  const statusData = [
    { name: 'Active', value: data.status.active, color: GOOGLE_STATUS_COLORS.active },
    { name: 'Disabled', value: data.status.disabled, color: GOOGLE_STATUS_COLORS.disabled },
    { name: 'Provisioned', value: data.status.provisioned, color: GOOGLE_STATUS_COLORS.provisioned },
    { name: 'Other', value: data.status.other, color: GOOGLE_STATUS_COLORS.other },
  ].filter(d => d.value > 0)

  const aueData = data.aue_by_year?.map(item => ({
    year: item.year,
    total: item.total,
    models: item.models,
    color: getAueColor(item.year),
  })) || []

  const expiredCount = aueData
    .filter(d => parseInt(d.year) <= 2024)
    .reduce((sum, d) => sum + d.total, 0)

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

  const AueTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">
            {d.year}: {d.total.toLocaleString()} devices
          </p>
          <div className="space-y-1">
            {d.models.map((model, idx) => (
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

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Monitor className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Devices</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{data.total.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{data.status.active.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{data.total > 0 ? Math.round((data.status.active / data.total) * 100) : 0}% of fleet</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Disabled</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{data.status.disabled.toLocaleString()}</p>
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
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.red }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Expired (&le;2024)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.amber }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Soon (2025-26)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.blue }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Upcoming (2027-28)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.emerald }} />
              <span className="text-xs text-slate-600 dark:text-slate-400">Good (2029+)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data Freshness */}
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

// ---------- IIQ Tab ----------

function IIQTabContent({ data, ticketData }) {
  if (!data) return null

  const statusData = [
    { name: 'In Service', value: data.status.in_service, color: IIQ_STATUS_COLORS.in_service },
    { name: 'In Storage', value: data.status.in_storage, color: IIQ_STATUS_COLORS.in_storage },
    { name: 'Other', value: data.status.other, color: IIQ_STATUS_COLORS.other },
  ].filter(d => d.value > 0)

  const roleData = data.by_role?.map((item, idx) => ({
    name: item.role,
    value: item.count,
    color: IIQ_ROLE_COLORS[item.role] || CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const locationData = data.by_location?.slice(0, 5).map((item, idx) => ({
    name: item.name,
    fullName: item.fullName || item.name,
    count: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const modelData = data.by_model?.slice(0, 5).map((item, idx) => ({
    name: item.model.length > 20 ? item.model.substring(0, 20) + '...' : item.model,
    fullName: item.model,
    count: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const IIQBarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {d.fullName || d.name}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {d.count.toLocaleString()} devices
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Package className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Assets</span>
          </div>
          <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{data.total.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">In Service</span>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{data.status.in_service.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{data.total > 0 ? Math.round((data.status.in_service / data.total) * 100) : 0}% of fleet</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">No Chromebook</span>
          </div>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{data.students?.without_chromebook || 0}</p>
          <p className="text-xs text-slate-400 mt-1">{data.students?.with_chromebook?.toLocaleString() || 0} students have one</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <DollarSign className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outstanding Fees</span>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">${data.fees.total_outstanding.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">{data.fees.users_with_balance} users with balance</p>
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
                <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No status data available
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {statusData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{entry.name}: {entry.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Location Table */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Devices by Location</h3>
            <span className="text-xs text-slate-400">{data.by_location?.length || 0} locations</span>
          </div>
          {data.by_location?.length > 0 ? (
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
                  {data.by_location.map((loc, idx) => (
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
                              style={{ width: `${Math.min(100, (loc.count / data.total) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">
                            {data.total > 0 ? ((loc.count / data.total) * 100).toFixed(1) : 0}%
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
                <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              No role data available
            </div>
          )}
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
                <Tooltip content={<IIQBarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
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
        {data.fees.top_users.length > 0 ? (
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
                {data.fees.top_users.map((user, idx) => (
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
      {ticketData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Tickets</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{ticketData.open_tickets}</p>
            <p className="text-xs text-slate-400 mt-1">currently open</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">School Year</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{ticketData.school_year_tickets}+</p>
            <p className="text-xs text-slate-400 mt-1">{ticketData.school_year} tickets</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <Clock className="h-4 w-4 text-slate-500" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">All Time</span>
            </div>
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{ticketData.total_all_time.toLocaleString()}</p>
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

// ---------- Meraki Tab ----------

function MerakiTabContent({ data }) {
  if (!data) return null

  const ssidData = data.clients?.by_ssid?.map((item, idx) => ({
    name: item.name,
    value: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const groupData = data.clients_by_group?.map((item, idx) => ({
    name: item.name,
    value: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const siteData = data.by_site?.map((item) => ({
    name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
    fullName: item.name,
    aps: item.aps,
    switches: item.switches,
    total: item.total,
  })) || []

  const apFirmwareData = data.firmware?.aps?.map((item, idx) => ({
    name: item.version,
    value: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const switchFirmwareData = data.firmware?.switches?.map((item, idx) => ({
    name: item.version,
    value: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const topApsData = data.top_aps?.map((item, idx) => ({
    name: item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name,
    fullName: item.name,
    count: item.count,
    color: CHART_PALETTE[idx % CHART_PALETTE.length],
  })) || []

  const MerakiBarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {d.fullName || d.name}
          </p>
          {d.aps !== undefined ? (
            <>
              <p className="text-sm text-purple-500 mt-1">{d.aps} APs</p>
              <p className="text-sm text-blue-500">{d.switches} Switches</p>
            </>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {d.count?.toLocaleString() || d.total?.toLocaleString()} clients
            </p>
          )}
        </div>
      )
    }
    return null
  }

  const infra = data.infrastructure || {}
  const statusData = infra.status || {}

  return (
    <div className="space-y-6">
      {/* Infrastructure Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">APs</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{infra.total_aps?.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Switches</span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{infra.total_switches?.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Devices Online</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{statusData.online?.toLocaleString()}</p>
          <p className="text-xs text-slate-400">APs + Switches</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dormant</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{statusData.dormant?.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Offline</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{statusData.offline?.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clients</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{data.clients?.total?.toLocaleString()}</p>
          <p className="text-xs text-slate-400">24h window</p>
        </div>
      </div>

      {/* Infrastructure by Site */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Infrastructure by Site</h3>
        {siteData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(400, siteData.length * 28)}>
            <BarChart data={siteData} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={115} />
              <Tooltip content={<MerakiBarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="aps" name="APs" fill={CHART_COLORS.purple} stackId="stack">
                <LabelList dataKey="aps" position="center" fill="#ffffff" fontSize={10} />
              </Bar>
              <Bar dataKey="switches" name="Switches" fill={CHART_COLORS.blue} stackId="stack">
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

      {/* Charts Row 1: SSID + Group Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
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
                  <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
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
                  <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
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
                  <Tooltip content={<SharedPieTooltip />} isAnimationActive={false} />
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

      {/* Charts Row 3: Top APs + Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Top APs by Client Count</h3>
          <p className="text-xs text-slate-400 -mt-2 mb-4">Access points with the most connected wireless clients</p>
          {topApsData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topApsData} layout="vertical" margin={{ top: 5, right: 40, left: 110, bottom: 5 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={105} />
                <Tooltip content={<MerakiBarTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
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

        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Device Models</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-purple-500 mb-3 flex items-center gap-1.5">
                <Radio className="h-3 w-3" /> Access Points
              </h4>
              <div className="space-y-2">
                {data.models?.aps?.map((item) => (
                  <div key={item.model} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.model}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-blue-500 mb-3 flex items-center gap-1.5">
                <Server className="h-3 w-3" /> Switches
              </h4>
              <div className="space-y-2">
                {data.models?.switches?.map((item) => (
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

      {/* Network Summary */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Wifi className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">Network Summary</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {infra.networks} Meraki networks across {data.by_site?.length || 0} sites.
                Data syncs nightly at 4 AM from Meraki Dashboard API.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Last device sync</p>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {formatRelativeTime(data.last_sync?.devices)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Overview Component ─────────────────────────────────────────────────

const TAB_CONFIG = [
  { id: 'google', label: 'Google', icon: Chrome },
  { id: 'iiq', label: 'IIQ', icon: Server },
  { id: 'meraki', label: 'Meraki', icon: Wifi },
]

export default function Overview() {
  const { integrations, loading: integrationsLoading } = useIntegrations()

  // Stats strip
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState(null)

  // Tab state
  const [activeTab, setActiveTab] = useState(null)

  // Cached tab data: { google: data|null, iiq: data|null, meraki: data|null }
  const [tabData, setTabData] = useState({})
  // Per-tab loading/error: { google: { loading, error }, ... }
  const [tabStatus, setTabStatus] = useState({})

  // Platform colors
  const [platformColors, setPlatformColors] = useState(() => ({
    iiq: getPlatformColor('iiq'),
    google: getPlatformColor('google'),
    meraki: getPlatformColor('meraki'),
  }))

  // Listen for color changes
  useEffect(() => {
    const handleColorsChange = () => {
      setPlatformColors({
        iiq: getPlatformColor('iiq'),
        google: getPlatformColor('google'),
        meraki: getPlatformColor('meraki'),
      })
    }
    window.addEventListener('atlas-colors-changed', handleColorsChange)
    return () => window.removeEventListener('atlas-colors-changed', handleColorsChange)
  }, [])

  // Determine configured platforms
  const configuredPlatforms = TAB_CONFIG.filter(t => integrations[t.id])

  // Set default active tab when integrations load
  useEffect(() => {
    if (!integrationsLoading && activeTab === null && configuredPlatforms.length > 0) {
      setActiveTab(configuredPlatforms[0].id)
    }
  }, [integrationsLoading, integrations]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch overview stats
  useEffect(() => {
    if (integrationsLoading) return
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/reports/overview/stats')
        setStats(response.data)
      } catch (err) {
        console.error('Failed to fetch overview stats:', err)
        setStatsError('Failed to load overview data')
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
  }, [integrationsLoading])

  // Lazy-load tab data when active tab changes
  const fetchTabData = useCallback(async (tabId) => {
    // Already cached
    if (tabData[tabId]) return
    // Already loading
    if (tabStatus[tabId]?.loading) return

    setTabStatus(prev => ({ ...prev, [tabId]: { loading: true, error: null } }))

    try {
      if (tabId === 'google') {
        const response = await axios.get('/api/reports/overview/google')
        setTabData(prev => ({ ...prev, google: response.data }))
      } else if (tabId === 'iiq') {
        const [iiqResponse, ticketResponse] = await Promise.all([
          axios.get('/api/reports/overview/iiq'),
          axios.get('/api/reports/overview/iiq/tickets'),
        ])
        setTabData(prev => ({ ...prev, iiq: { main: iiqResponse.data, tickets: ticketResponse.data } }))
      } else if (tabId === 'meraki') {
        const response = await axios.get('/api/reports/overview/meraki')
        setTabData(prev => ({ ...prev, meraki: response.data }))
      }
      setTabStatus(prev => ({ ...prev, [tabId]: { loading: false, error: null } }))
    } catch (err) {
      console.error(`Failed to fetch ${tabId} tab data:`, err)
      setTabStatus(prev => ({
        ...prev,
        [tabId]: { loading: false, error: `Failed to load ${tabId} dashboard data` },
      }))
    }
  }, [tabData, tabStatus])

  useEffect(() => {
    if (activeTab) {
      fetchTabData(activeTab)
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Color helpers
  const getVendorBorderClass = (vendor) => {
    const colorKey = platformColors[vendor]
    return BORDER_COLORS[colorKey] || ''
  }

  const getPlatformColorClasses = (platformId) => {
    const colorKey = platformColors[platformId] || 'blue'
    return COLOR_CLASSES[colorKey] || COLOR_CLASSES.blue
  }

  // ─── Empty State ─────────────────────────────────────────────────────────

  if (!integrationsLoading && !integrations.google && !integrations.iiq && !integrations.meraki) {
    return (
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-6 w-6 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Overview</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400">
            Visual insights across all data sources
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6">
            <Settings className="h-10 w-10 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">
            No Data Sources Configured
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md">
            Configure your data sources to get started
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <Settings className="h-4 w-4" />
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  // ─── Main Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-6 w-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Overview</h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Visual insights across all data sources
        </p>
      </div>

      {/* ─── Stats Strip ──────────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
        </div>
      ) : statsError ? (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {statsError}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* IIQ Assets */}
          {integrations.iiq && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('iiq')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${getPlatformColorClasses('iiq').iconBg} rounded-lg`}>
                  <Monitor className={`h-4 w-4 ${getPlatformColorClasses('iiq').icon}`} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">IIQ Assets</span>
              </div>
              {stats.iiq?.configured ? (
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.iiq?.total_assets}</p>
              ) : (
                <p className="text-sm font-medium text-slate-400 italic">No Data Synced</p>
              )}
            </div>
          )}

          {/* Assigned (IIQ) */}
          {integrations.iiq && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('iiq')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${getPlatformColorClasses('iiq').iconBg} rounded-lg`}>
                  <Users className={`h-4 w-4 ${getPlatformColorClasses('iiq').icon}`} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned</span>
              </div>
              {stats.iiq?.configured ? (
                <>
                  <p className={`text-3xl font-bold ${getPlatformColorClasses('iiq').stat}`}>{stats.iiq?.assigned}</p>
                  <p className="text-xs text-slate-400 mt-1">{stats.iiq?.unassigned} unassigned</p>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-400 italic">No Data Synced</p>
              )}
            </div>
          )}

          {/* Google Active */}
          {integrations.google && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('google')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${getPlatformColorClasses('google').iconBg} rounded-lg`}>
                  <CheckCircle className={`h-4 w-4 ${getPlatformColorClasses('google').icon}`} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Google Active</span>
              </div>
              {stats.google?.configured ? (
                <>
                  <p className={`text-3xl font-bold ${getPlatformColorClasses('google').stat}`}>{stats.google?.active}</p>
                  <p className="text-xs text-slate-400 mt-1">of {stats.google?.total_devices} in Google</p>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-400 italic">No Data Synced</p>
              )}
            </div>
          )}

          {/* AUE Expired (Google) */}
          {integrations.google && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('google')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expired AUE</span>
              </div>
              {stats.google?.configured ? (
                <>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.google?.aue_expired}</p>
                  <p className="text-xs text-slate-400 mt-1">past end of life</p>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-400 italic">No Data Synced</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Source Tabs ──────────────────────────────────────────────────── */}
      {configuredPlatforms.length > 0 && (
        <div>
          {/* Tab Buttons */}
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6">
            {configuredPlatforms.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const colors = getPlatformColorClasses(tab.id)
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    isActive
                      ? `${colors.tab} border-current`
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div>
            {tabStatus[activeTab]?.loading && !tabData[activeTab] ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
              </div>
            ) : tabStatus[activeTab]?.error && !tabData[activeTab] ? (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {tabStatus[activeTab].error}
              </div>
            ) : (
              <>
                {activeTab === 'google' && tabData.google && (
                  <GoogleTabContent data={tabData.google} />
                )}
                {activeTab === 'iiq' && tabData.iiq && (
                  <IIQTabContent data={tabData.iiq.main} ticketData={tabData.iiq.tickets} />
                )}
                {activeTab === 'meraki' && tabData.meraki && (
                  <MerakiTabContent data={tabData.meraki} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
