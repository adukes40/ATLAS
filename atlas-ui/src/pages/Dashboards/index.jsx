import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import {
  LayoutDashboard, Chrome, Server, Wifi, ArrowRight,
  Monitor, Users, AlertTriangle, CheckCircle, Loader2
} from 'lucide-react'
import { useIntegrations } from '../../context/IntegrationsContext'

export default function DashboardsIndex() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { integrations } = useIntegrations()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('/api/dashboards/overview')
        setStats(response.data)
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Get vendor border class based on user preference
  const getVendorBorderClass = (vendor) => {
    const showColors = localStorage.getItem('atlas_vendor_colors') !== 'false'
    if (!showColors) return ''
    const colors = {
      iiq: 'border-l-4 border-l-blue-500',
      google: 'border-l-4 border-l-emerald-500',
      meraki: 'border-l-4 border-l-purple-500'
    }
    return colors[vendor] || ''
  }

  const dashboards = [
    {
      id: 'google',
      title: 'Google Admin',
      description: 'AUE status, OS versions, enrollment stats',
      icon: Chrome,
      color: 'emerald',
      to: '/dashboards/google',
      ready: true,
      stat: stats?.google?.total_devices,
      statLabel: 'devices'
    },
    {
      id: 'iiq',
      title: 'Incident IQ',
      description: 'Asset status, assignments, user fees',
      icon: Server,
      color: 'blue',
      to: '/dashboards/iiq',
      ready: true,
      stat: stats?.iiq?.total_assets,
      statLabel: 'assets'
    },
    {
      id: 'meraki',
      title: 'Meraki Network',
      description: 'AP load, client distribution, network activity',
      icon: Wifi,
      color: 'purple',
      to: '/dashboards/meraki',
      ready: true,
      stat: stats?.network?.cached_clients,
      statLabel: 'cached'
    }
  ]

  const colorClasses = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-950/20',
      border: 'border-blue-200 dark:border-blue-900/50',
      icon: 'text-blue-500',
      hover: 'hover:border-blue-300 dark:hover:border-blue-700',
      stat: 'text-blue-600 dark:text-blue-400'
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/20',
      border: 'border-emerald-200 dark:border-emerald-900/50',
      icon: 'text-emerald-500',
      hover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
      stat: 'text-emerald-600 dark:text-emerald-400'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-950/20',
      border: 'border-purple-200 dark:border-purple-900/50',
      icon: 'text-purple-500',
      hover: 'hover:border-purple-300 dark:hover:border-purple-700',
      stat: 'text-purple-600 dark:text-purple-400'
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <LayoutDashboard className="h-6 w-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboards</h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Visual insights across all data sources
        </p>
      </div>

      {/* Overview Stats */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* IIQ Assets */}
          {integrations.iiq && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('iiq')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Monitor className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">IIQ Assets</span>
              </div>
              <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{stats.iiq?.total_assets}</p>
            </div>
          )}

          {/* Assigned (IIQ) */}
          {integrations.iiq && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('iiq')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned</span>
              </div>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.iiq?.assigned}</p>
              <p className="text-xs text-slate-400 mt-1">{stats.iiq?.unassigned} unassigned</p>
            </div>
          )}

          {/* Google Active */}
          {integrations.google && (
            <div className={`bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${getVendorBorderClass('google')}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Google Active</span>
              </div>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.google?.active}</p>
              <p className="text-xs text-slate-400 mt-1">of {stats.google?.total_devices} in Google</p>
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
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.google?.aue_expired}</p>
              <p className="text-xs text-slate-400 mt-1">past end of life</p>
            </div>
          )}
        </div>
      )}

      {/* Dashboard Cards */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Data Sources</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {dashboards.filter(d => integrations[d.id]).map((dashboard) => {
            const colors = colorClasses[dashboard.color]
            const Icon = dashboard.icon

            const CardContent = (
              <>
                {!dashboard.ready && (
                  <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white dark:bg-slate-800 px-2 py-1 rounded shadow-sm">
                    Coming Soon
                  </span>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className={`inline-flex p-3 rounded-xl bg-white dark:bg-slate-800 shadow-sm`}>
                    <Icon className={`h-6 w-6 ${colors.icon}`} />
                  </div>
                  {dashboard.stat !== undefined && (
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${colors.stat}`}>{dashboard.stat}</p>
                      <p className="text-[10px] text-slate-400 uppercase">{dashboard.statLabel}</p>
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {dashboard.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  {dashboard.description}
                </p>

                {dashboard.ready ? (
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${colors.icon}`}>
                    View Dashboard <ArrowRight className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-400">
                    Dashboard in development
                  </span>
                )}
              </>
            )

            const vendorBorder = getVendorBorderClass(dashboard.id)

            return dashboard.ready ? (
              <Link
                key={dashboard.id}
                to={dashboard.to}
                className={`relative p-6 rounded-2xl border-2 transition-all duration-200 ${colors.bg} ${colors.border} ${colors.hover} ${vendorBorder} cursor-pointer block`}
              >
                {CardContent}
              </Link>
            ) : (
              <div
                key={dashboard.id}
                className={`relative p-6 rounded-2xl border-2 transition-all duration-200 ${colors.bg} ${colors.border} ${vendorBorder}`}
              >
                {CardContent}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
        <LayoutDashboard className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300 mb-1">
          All Dashboards Active
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Google and IIQ sync nightly at 2 AM and 3 AM. Meraki data is cached on-demand from Device 360 lookups.
        </p>
      </div>
    </div>
  )
}
