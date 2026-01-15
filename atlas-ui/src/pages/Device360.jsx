import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Search, Server, Monitor, Wifi, AlertTriangle, CheckCircle,
  ExternalLink, User, GraduationCap, MapPin, Wrench, Building2,
  Cpu, HardDrive, Layout, ShieldCheck, History,
  Activity, Gauge, Clock, Battery, Globe, Radio, RefreshCw, DollarSign
} from 'lucide-react'
import { useIntegrations } from '../context/IntegrationsContext'

// --- CONFIGURATION ---
// IIQ domain is loaded from environment variable (set in .env or at build time)
const IIQ_DOMAIN = import.meta.env.VITE_IIQ_URL || "";

export default function Device360() {
  const [serial, setSerial] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [showVendorColors, setShowVendorColors] = useState(
    () => localStorage.getItem('atlas_vendor_colors') !== 'false'
  )
  const [displaySettings, setDisplaySettings] = useState(() => ({
    timezone: localStorage.getItem('atlas_timezone') || 'America/New_York',
    hour12: localStorage.getItem('atlas_time_format') !== '24'
  }))
  const { integrations } = useIntegrations()

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsChange = (e) => {
      setShowVendorColors(e.detail?.showVendorColors ?? true)
      setDisplaySettings({
        timezone: localStorage.getItem('atlas_timezone') || 'America/New_York',
        hour12: localStorage.getItem('atlas_time_format') !== '24'
      })
    }
    window.addEventListener('atlas-settings-changed', handleSettingsChange)
    return () => window.removeEventListener('atlas-settings-changed', handleSettingsChange)
  }, [])

  // Helper to get vendor border class
  const getVendorBorderClass = (vendor) => {
    if (!showVendorColors) return ''
    const colors = {
      iiq: 'border-l-4 border-l-blue-500',
      google: 'border-l-4 border-l-emerald-500',
      meraki: 'border-l-4 border-l-purple-500'
    }
    return colors[vendor] || ''
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!serial) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const response = await axios.get(`/api/device/${serial}`)
      setData(response.data)
    } catch (err) {
      console.error(err)
      setError("Device not found or System Offline")
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    if (!data?.serial) return;
    setSyncing(true);
    try {
        await axios.post(`/api/sync/iiq/${data.serial}`);
        const refresh = await axios.get(`/api/device/${data.serial}`);
        setData(refresh.data);
    } catch (err) {
        alert("Sync Failed: " + (err.response?.data?.detail || err.message));
    } finally {
        setSyncing(false);
    }
  }

  // --- UI HELPERS ---
  const getTempColor = (temp) => {
    if (!temp) return 'text-slate-400';
    if (temp < 60) return 'text-emerald-500';
    if (temp < 85) return 'text-amber-500';
    return 'text-red-500';
  };

  const getStatusBadge = (status) => {
    const s = status?.toUpperCase();
    if (s === 'ACTIVE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    if (s === 'DISABLED') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'Unknown';
    // Handle timestamp - ensure it's treated as UTC if no timezone specified
    let dateStr = timestamp;
    if (typeof timestamp === 'string' && !timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
      dateStr = timestamp + 'Z';
    }
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      timeZone: displaySettings.timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: displaySettings.hour12
    });
  };

  const getSignalStrengthLabel = (rssi) => {
    if (!rssi) return null;
    // RSSI typically ranges from -30 (excellent) to -90 (poor)
    if (rssi >= -50) return { label: 'Excellent', color: 'text-emerald-500' };
    if (rssi >= -60) return { label: 'Good', color: 'text-emerald-500' };
    if (rssi >= -70) return { label: 'Fair', color: 'text-amber-500' };
    return { label: 'Poor', color: 'text-red-500' };
  };

  const calculatePercent = (free, total) => {
    if (!free || !total) return 0;
    const f = parseFloat(free);
    const t = parseFloat(total);
    return Math.round(((t - f) / t) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="max-w-xl mx-auto">
        <form onSubmit={handleSearch} className="relative flex items-center group">
          <Search className="absolute left-4 text-slate-400 h-5 w-5 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Scan Serial or Asset Tag..."
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg transition-all dark:text-white"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="absolute right-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 shadow-md active:translate-y-px"
          >
            {loading ? '...' : 'Lookup'}
          </button>
        </form>
        {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg border border-red-100 dark:border-red-900/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertTriangle className="h-5 w-5"/>
                <span className="font-medium text-sm">{error}</span>
            </div>
        )}
      </div>

      {/* Results View */}
      {data && (
        <div className="space-y-6">

          {/* Main Identity Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col lg:flex-row gap-8">

                {/* Column 1: Device Link & Base Info */}
                <div className="flex-none lg:w-80">
                    <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex flex-col gap-4">
                            {/* Status Header */}
                            <div className="flex items-center justify-end">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusBadge(data.sources.google?.status || 'Unknown')}`}>
                                    {data.sources.google?.status || 'Unknown'}
                                </span>
                            </div>

                            {/* Identifiers */}
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Serial Number</p>
                                <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono break-all leading-tight">
                                    {data.serial}
                                </h2>
                            </div>

                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Asset Tag</p>
                                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 font-mono">
                                    {data.sources.iiq?.tag || "No Tag"}
                                </h3>
                            </div>

                            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                                <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 leading-snug">
                                    {data.sources.iiq?.model || "Unknown Model"}
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 mt-2">
                                {data.sources.iiq?.asset_id && (
                                    <a
                                        href={`${IIQ_DOMAIN}/agent/assets/${data.sources.iiq.asset_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase rounded-lg transition shadow-md active:translate-y-px"
                                    >
                                        IIQ <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                                {data.sources.google?.google_id && (
                                    <a
                                        href={`https://admin.google.com/ac/chrome/devices/${data.sources.google.google_id}?journey=217`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-lg transition shadow-md active:translate-y-px"
                                    >
                                        Google <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: User Identity & Building */}
                <div className="flex-1 lg:border-l lg:border-slate-100 lg:dark:border-slate-800 lg:pl-8">
                    <div className="flex items-start gap-4">
                        <div className="mt-1 p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                            <User className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                                    {data.identity.assigned_user || "Unassigned"}
                                </h3>
                                <div className="flex items-center gap-2">
                                    {data.sources.iiq?.owner_iiq_id && (
                                        <a
                                            href={`${IIQ_DOMAIN}/agent/users/${data.sources.iiq.owner_iiq_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition shadow-sm"
                                        >
                                            IIQ <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                    <span
                                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase border border-slate-200 dark:border-slate-700 cursor-not-allowed shadow-sm"
                                        title="Google user lookup coming soon"
                                    >
                                        Google <ExternalLink className="h-3 w-3" />
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-medium">
                                        <Building2 className="h-4 w-4 text-slate-400" />
                                        <span>{data.sources.iiq?.location || "Unknown Location"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-medium">
                                        <ShieldCheck className="h-4 w-4 text-slate-400" />
                                        <span>ID: {data.sources.iiq?.assigned_school_id || "N/A"}</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 content-start">
                                    {data.sources.iiq?.assigned_grade && (
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            Grade {data.sources.iiq.assigned_grade}
                                        </span>
                                    )}
                                    {data.sources.iiq?.assigned_homeroom && (
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            Room {data.sources.iiq.assigned_homeroom}
                                        </span>
                                    )}
                                    {data.sources.iiq?.fee_balance > 0 && (
                                        <span className="bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center gap-1">
                                            <DollarSign className="h-3 w-3" />
                                            {data.sources.iiq.fee_balance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} Due
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 3: Global Actions */}
                <div className="flex-none lg:w-48 flex flex-col gap-3">
                     <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition active:scale-95 disabled:opacity-50 shadow-sm"
                     >
                        <Server className={`h-4 w-4 ${syncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
                        {syncing ? 'Syncing...' : 'Force Refresh'}
                     </button>

                     {data.sources.iiq?.ticket_count > 0 ? (
                        <div className="flex items-center justify-center gap-2 w-full py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-bold shadow-sm">
                            <Wrench className="h-4 w-4" /> {data.sources.iiq.ticket_count} Active Ticket(s)
                        </div>
                     ) : (
                        <div className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs font-bold shadow-sm">
                            <ShieldCheck className="h-4 w-4" /> System Healthy
                        </div>
                     )}
                </div>
            </div>
          </div>

          {/* Detailed Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

             {/* Google Hardware Health */}
             {integrations.google && (
             <div className={`bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 ${getVendorBorderClass('google')}`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold">
                        <Cpu className="h-5 w-5 text-emerald-500" />
                        <span>Hardware Health</span>
                        <span className="text-xs font-normal text-slate-400">(Google)</span>
                    </div>
                    {data.sources.google?.cpu_temp && (
                        <span className={`text-lg font-mono font-bold ${getTempColor(data.sources.google.cpu_temp)}`}>
                            {data.sources.google.cpu_temp}°C
                        </span>
                    )}
                </div>

                <div className="space-y-6">
                    {/* RAM Usage */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1"><Gauge className="h-3 w-3" /> Memory</div>
                            <span>{data.sources.google?.ram_total ? `${data.sources.google.ram_total}GB` : 'N/A'}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                                style={{ width: `${calculatePercent(data.sources.google?.ram_free, data.sources.google?.ram_total)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Storage Usage */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> Storage</div>
                            <span>{data.sources.google?.disk_total ? `${data.sources.google.disk_total}GB` : 'N/A'}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                style={{ width: `${calculatePercent(data.sources.google?.disk_free, data.sources.google?.disk_total)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Battery Health */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1"><Battery className="h-3 w-3" /> Battery Health</div>
                            <span>{data.sources.google?.battery_health != null ? `${data.sources.google.battery_health}%` : 'N/A'}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${
                                    data.sources.google?.battery_health >= 80 ? 'bg-emerald-500' :
                                    data.sources.google?.battery_health >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${data.sources.google?.battery_health || 0}%` }}
                            ></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Boot Mode</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{data.sources.google?.boot_mode || 'N/A'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">AUE Date</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-0.5">{data.sources.google?.aue_date || 'N/A'}</p>
                        </div>
                    </div>
                </div>
             </div>
             )}

             {/* Network & Software (Google) */}
             {integrations.google && (
             <div className={`bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 ${getVendorBorderClass('google')}`}>
                <div className="flex items-center gap-2 mb-6 text-slate-800 dark:text-slate-100 font-bold">
                    <Wifi className="h-5 w-5 text-emerald-500" />
                    <span>Connectivity & Software</span>
                    <span className="text-xs font-normal text-slate-400">(Google)</span>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/50 dark:border-emerald-900/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                <Activity className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-emerald-600/70 dark:text-emerald-400/70 uppercase">OS Version</p>
                                <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">{data.sources.google?.os_version || 'N/A'}</p>
                            </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${data.sources.google?.os_compliance === 'compliant' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                            {data.sources.google?.os_compliance || 'Unknown'}
                        </span>
                    </div>

                    <div className="space-y-3 px-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Device OU</span>
                            <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={data.sources.google?.org_unit_path}>
                                {data.sources.google?.org_unit_path || 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Annotated Tag</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{data.sources.google?.annotated_tag?.split('|')[0] || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">Recent Users</span>
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{data.sources.google?.recent_users?.[0] || 'No Login Data'}</span>
                        </div>
                        <div className="pt-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase mb-2">
                                <Clock className="h-3 w-3" /> Recent Login History
                            </div>
                            <div className="flex flex-col gap-1.5">
                                {data.sources.google?.recent_users?.slice(0, 3).map((user, i) => (
                                    <div key={i} className="text-xs py-1 px-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400 truncate">
                                        {user}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
             </div>
             )}

             {/* Network Info (Meraki) */}
             {integrations.meraki && (
             <div className={`bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 ${getVendorBorderClass('meraki')}`}>
                <div className="flex items-center gap-2 mb-6 text-slate-800 dark:text-slate-100 font-bold">
                    <Radio className="h-5 w-5 text-purple-500" />
                    <span>Network Info</span>
                    <span className="text-xs font-normal text-slate-400">(Meraki)</span>
                </div>

                <div className="space-y-4">
                    {/* AP Location (Meraki) - Check if on State Network first */}
                    {data.sources.google?.wan_ip && !data.sources.google.wan_ip.startsWith('167.') ? (
                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                    <Globe className="h-4 w-4 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-amber-600/70 dark:text-amber-400/70 uppercase">Network Status</p>
                                    <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Not on State Network</p>
                                </div>
                            </div>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 pl-11">
                                Device is connected to an external network
                            </p>
                        </div>
                    ) : data.sources.meraki?.ap_name ? (
                        <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100/50 dark:border-purple-900/30">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                    <Wifi className="h-4 w-4 text-purple-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-purple-600/70 dark:text-purple-400/70 uppercase">Connected AP</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.sources.meraki.ap_name}</p>
                                </div>
                                {data.sources.meraki.rssi && (
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Signal</p>
                                        <p className={`text-sm font-bold ${getSignalStrengthLabel(data.sources.meraki.rssi)?.color}`}>
                                            {getSignalStrengthLabel(data.sources.meraki.rssi)?.label}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 pl-11 space-y-0.5">
                                {data.sources.meraki.last_seen && (
                                    <p className="text-xs text-slate-500">
                                        Last Seen: {formatDateTime(data.sources.meraki.last_seen)}
                                    </p>
                                )}
                                {data.sources.meraki.ssid && (
                                    <p className="text-xs text-slate-500">
                                        SSID: {data.sources.meraki.ssid}
                                    </p>
                                )}
                                {data.sources.meraki.group_policy && (
                                    <p className="text-xs text-slate-500">
                                        Group Policy: <span className="font-medium text-slate-600 dark:text-slate-400">{data.sources.meraki.group_policy}</span>
                                    </p>
                                )}
                                {data.sources.meraki.mac_address && (
                                    <p className="text-xs text-slate-500">
                                        MAC: <span className="font-mono text-slate-600 dark:text-slate-400">{data.sources.meraki.mac_address}</span>
                                    </p>
                                )}
                            </div>
                            {/* Meraki Dashboard Link */}
                            {data.sources.meraki.network_url && data.sources.meraki.client_id && (
                                <div className="mt-3 pl-11">
                                    <a
                                        href={`${data.sources.meraki.network_url.replace('/manage/clients', '/manage/usage/list')}#c=${data.sources.meraki.client_id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold uppercase rounded-lg transition shadow-sm"
                                    >
                                        Meraki <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                    <Wifi className="h-4 w-4 text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Connected AP</p>
                                    <p className="text-sm font-medium text-slate-400">Not detected</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* IP Addresses (Google) */}
                    <div className="space-y-3 px-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                                <Monitor className="h-3 w-3" /> LAN IP
                            </span>
                            <span className="font-mono text-sm text-slate-700 dark:text-slate-200">
                                {data.sources.google?.lan_ip || 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                                <Globe className="h-3 w-3" /> WAN IP
                            </span>
                            <span className="font-mono text-sm text-slate-700 dark:text-slate-200">
                                {data.sources.google?.wan_ip || 'N/A'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200 dark:border-slate-700">
                            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
                                <RefreshCw className="h-3 w-3" /> Last Policy Sync
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                                {formatDateTime(data.sources.google?.last_sync)}
                            </span>
                        </div>
                    </div>
                </div>
             </div>
             )}

             {/* Conflict & Intelligence (Cross-source) */}
             <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-6 text-slate-800 dark:text-slate-100 font-bold">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <span>Conflict Watch</span>
                </div>
                {data.conflicts.length > 0 ? (
                    <div className="space-y-4">
                        {data.conflicts.map((conflict, i) => (
                            <div
                                key={conflict.id || i}
                                className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="h-4 w-4 text-red-500 flex-none" />
                                    <h4 className="text-sm font-bold text-red-700 dark:text-red-400">
                                        {conflict.title}
                                    </h4>
                                </div>
                                <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed mb-3 pl-6">
                                    {conflict.description}
                                </p>
                                <div className="pl-6 pt-2 border-t border-red-100 dark:border-red-900/30">
                                    <p className="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-1">
                                        Recommended Action
                                    </p>
                                    <p className="text-xs text-red-600 dark:text-red-300 leading-relaxed">
                                        {conflict.remediation}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-16 w-16 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mb-4 border border-emerald-100 dark:border-emerald-900/50">
                            <ShieldCheck className="h-8 w-8 text-emerald-500" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Data Integrity Confirmed</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No mismatches between IIQ and Google Admin</p>
                    </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center mt-20 opacity-40 animate-in zoom-in duration-700">
            <div className="relative">
                <Monitor className="h-24 w-24 text-slate-300 dark:text-slate-700" />
                <Layout className="h-10 w-10 text-blue-400 dark:text-blue-600 absolute -bottom-2 -right-2" />
            </div>
            <h3 className="text-xl font-medium text-slate-400 dark:text-slate-600 mt-6 tracking-tight italic">Scan an asset to begin analysis</h3>
        </div>
      )}
    </div>
  )
}
