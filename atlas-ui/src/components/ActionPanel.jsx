import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  X, Power, PowerOff, FolderInput, Trash2, Loader2,
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Monitor, Tag, MapPin, User, FileText, RotateCcw, RefreshCw
} from 'lucide-react'
import { useIntegrations } from '../context/IntegrationsContext'

// Helper to get a device field value, supporting both flat and source__field formats
function getDeviceField(device, ...fieldNames) {
  for (const name of fieldNames) {
    if (device[name] !== undefined && device[name] !== null) return device[name]
  }
  return undefined
}

// Detect if devices have Google data (for smart tab visibility)
// Uses _has_google flag from unified reports, falls back to field-presence check (Device 360)
function devicesHaveGoogleData(devices) {
  return devices.some(d =>
    d._has_google !== undefined
      ? d._has_google
      : getDeviceField(d, 'google_status', 'google_devices__status', 'google_id', 'google_devices__google_id') != null
  )
}

// Detect if devices have IIQ data (for smart tab visibility)
function devicesHaveIiqData(devices) {
  return devices.some(d =>
    d._has_iiq !== undefined
      ? d._has_iiq
      : getDeviceField(d, 'serial_number', 'iiq_assets__serial_number', 'iiq_status', 'iiq_assets__status', 'iiq_id', 'iiq_assets__iiq_id') != null
  )
}

// Get subset of devices eligible for Google actions (Chromebooks only)
function getGoogleEligibleDevices(devices) {
  return devices.filter(d =>
    d._has_google !== undefined
      ? d._has_google
      : getDeviceField(d, 'google_status', 'google_devices__status', 'google_id', 'google_devices__google_id') != null
  )
}

// Get subset of devices eligible for IIQ actions
function getIiqEligibleDevices(devices) {
  return devices.filter(d =>
    d._has_iiq !== undefined
      ? d._has_iiq
      : getDeviceField(d, 'serial_number', 'iiq_assets__serial_number', 'iiq_status', 'iiq_assets__status', 'iiq_id', 'iiq_assets__iiq_id') != null
  )
}

// Extract serial number from a device row (handles both flat and source__field formats)
function getSerial(device) {
  return getDeviceField(device, 'serial_number', 'iiq_assets__serial_number', 'google_devices__serial_number', 'serial') || ''
}

export default function ActionPanel({ devices, onClose }) {
  const { integrations } = useIntegrations()

  // Smart device type detection
  const hasGoogleData = devicesHaveGoogleData(devices)
  const hasIiqData = devicesHaveIiqData(devices)
  const showGoogle = integrations.google && hasGoogleData
  const showIiq = integrations.iiq && hasIiqData
  const defaultTab = showGoogle ? 'google' : showIiq ? 'iiq' : 'google'

  const [activeTab, setActiveTab] = useState(defaultTab)
  const [expandedAction, setExpandedAction] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [results, setResults] = useState(null)
  const [visible, setVisible] = useState(false)

  // OU state
  const [orgUnits, setOrgUnits] = useState([])
  const [ouLoaded, setOuLoaded] = useState(false)
  const [ouSearch, setOuSearch] = useState('')
  const [selectedOU, setSelectedOU] = useState(null)

  // Deprovision state
  const [deprovisionReason, setDeprovisionReason] = useState('')
  const [deprovisionConfirm, setDeprovisionConfirm] = useState('')

  // IIQ state
  const [iiqStatuses, setIiqStatuses] = useState([])
  const [iiqStatusesLoaded, setIiqStatusesLoaded] = useState(false)
  const [iiqStatusValue, setIiqStatusValue] = useState('')
  const [iiqLocations, setIiqLocations] = useState([])
  const [iiqLocationsLoaded, setIiqLocationsLoaded] = useState(false)
  const [iiqLocationValue, setIiqLocationValue] = useState('')
  const [iiqTagValue, setIiqTagValue] = useState('')
  const [iiqUserSearch, setIiqUserSearch] = useState('')
  const [iiqUserResults, setIiqUserResults] = useState([])
  const [iiqUserLoading, setIiqUserLoading] = useState(false)
  const [selectedIiqUser, setSelectedIiqUser] = useState(null)

  const isSingle = devices.length === 1
  const device = isSingle ? devices[0] : null

  // Animate in on mount + preload IIQ statuses if IIQ is the default tab
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    if (!showGoogle && showIiq) { loadIiqStatuses(); loadIiqLocations() }
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Load org units on demand
  const loadOrgUnits = async () => {
    if (ouLoaded) return
    try {
      const res = await axios.get('/api/google/org-units')
      setOrgUnits(res.data.org_units || [])
      setOuLoaded(true)
    } catch {
      setResults({ type: 'error', message: 'Failed to load org units' })
    }
  }

  // Load IIQ statuses on demand
  const loadIiqStatuses = async () => {
    if (iiqStatusesLoaded) return
    try {
      const res = await axios.get('/api/iiq/statuses')
      setIiqStatuses(res.data.statuses || [])
      setIiqStatusesLoaded(true)
    } catch {
      // silently fail — dropdown will just be empty
    }
  }

  // Load IIQ locations on demand
  const loadIiqLocations = async () => {
    if (iiqLocationsLoaded) return
    try {
      const res = await axios.get('/api/iiq/locations')
      setIiqLocations(res.data.locations || [])
      setIiqLocationsLoaded(true)
    } catch {
      // silently fail
    }
  }

  const filteredOUs = orgUnits.filter(ou =>
    ou.toLowerCase().includes(ouSearch.toLowerCase())
  )

  // Debounced IIQ user search
  useEffect(() => {
    if (iiqUserSearch.length < 2) {
      setIiqUserResults([])
      return
    }
    if (selectedIiqUser) return // Don't search when user just selected
    const timer = setTimeout(async () => {
      setIiqUserLoading(true)
      try {
        const res = await axios.get('/api/iiq/search-users', { params: { q: iiqUserSearch } })
        setIiqUserResults(res.data.users || [])
      } catch {
        setIiqUserResults([])
      } finally {
        setIiqUserLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [iiqUserSearch, selectedIiqUser])

  // Toggle accordion (Google tab actions)
  const toggleAction = (action) => {
    if (expandedAction === action) {
      setExpandedAction(null)
    } else {
      setExpandedAction(action)
      if (action === 'move-ou') loadOrgUnits()
    }
    setResults(null)
  }

  // --- SINGLE DEVICE ACTIONS ---
  const handleSingleAction = async (endpoint, body = {}) => {
    const serial = getSerial(device)
    setActionLoading(endpoint)
    setResults(null)
    try {
      await axios.post(`/api/device/${serial}/google/${endpoint}`, body)
      setResults({ type: 'success', message: `Action completed successfully. Click Force Refresh to see updated values.` })
    } catch (err) {
      setResults({ type: 'error', message: err.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
    }
  }

  // --- BULK ACTIONS ---
  const googleEligible = !isSingle ? getGoogleEligibleDevices(devices) : []
  const iiqEligible = !isSingle ? getIiqEligibleDevices(devices) : []
  const googleCount = googleEligible.length
  const isMixedGoogle = !isSingle && googleCount > 0 && googleCount < devices.length

  const handleBulkAction = async (endpoint, body = {}) => {
    const serials = googleEligible.map(d => getSerial(d)).filter(Boolean)
    if (serials.length === 0) {
      setResults({ type: 'error', message: 'No Chromebooks in selection — Google actions require Chromebook devices.' })
      return
    }
    setActionLoading(endpoint)
    setResults(null)
    try {
      const res = await axios.post(`/api/bulk/google/${endpoint}`, { serials, ...body })
      const data = res.data
      setResults({
        type: data.failed > 0 ? 'partial' : 'success',
        message: `${data.success} succeeded, ${data.failed} failed`,
        errors: data.errors || []
      })
    } catch (err) {
      setResults({ type: 'error', message: err.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
    }
  }

  // --- IIQ COMBINED APPLY ---
  const iiqHasChanges = !!(iiqStatusValue || iiqLocationValue || iiqTagValue || selectedIiqUser)

  const handleIIQApply = async () => {
    const payload = {}
    if (iiqStatusValue) payload.status_id = iiqStatusValue
    if (iiqLocationValue) payload.location_id = iiqLocationValue
    if (iiqTagValue) payload.asset_tag = iiqTagValue
    if (selectedIiqUser) payload.user_id = selectedIiqUser.user_id

    setActionLoading('iiq-apply')
    setResults(null)
    try {
      if (isSingle) {
        const serial = getSerial(device)
        await axios.post(`/api/device/${serial}/iiq/update`, payload)
        setResults({ type: 'success', message: 'Changes applied successfully. Click Force Refresh to see updated values.' })
      } else {
        const serials = iiqEligible.map(d => getSerial(d)).filter(Boolean)
        const res = await axios.post('/api/bulk/iiq/update', { serials, ...payload })
        const data = res.data
        setResults({
          type: data.failed > 0 ? 'partial' : 'success',
          message: `${data.success} succeeded, ${data.failed} failed`,
          errors: data.errors || []
        })
      }
      // Reset fields after success
      setIiqStatusValue('')
      setIiqLocationValue('')
      setIiqTagValue('')
      setSelectedIiqUser(null)
      setIiqUserSearch('')
    } catch (err) {
      setResults({ type: 'error', message: err.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
    }
  }

  // Dispatch to single or bulk
  const handleGoogleAction = (endpoint, body = {}) => {
    if (isSingle) handleSingleAction(endpoint, body)
    else handleBulkAction(endpoint, body)
  }

  // Count tabs to show (smart: only show tabs for integrations with data in selected devices)
  // NOTE: IIQ actions temporarily disabled due to unreliable API behavior
  const tabs = []
  if (showGoogle) tabs.push({ key: 'google', label: 'Google' })
  // if (showIiq) tabs.push({ key: 'iiq', label: 'IIQ' })

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-[480px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {isSingle ? 'Manage Device' : `Bulk Actions`}
            </h2>
            {isSingle ? (
              <p className="text-sm text-slate-500 font-mono mt-0.5">
                {getSerial(device)}
                {(getDeviceField(device, 'asset_tag', 'iiq_assets__asset_tag', 'tag')) && <span className="text-slate-400 ml-2">({getDeviceField(device, 'asset_tag', 'iiq_assets__asset_tag', 'tag')})</span>}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="font-bold text-slate-700 dark:text-slate-300">{devices.length}</span> devices selected
              </p>
            )}
          </div>
          {!isSingle && !showGoogle && !showIiq && (
            <span className="text-xs text-slate-400">No actions available</span>
          )}
          <button onClick={handleClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Tab Bar (only if multiple integrations) */}
        {tabs.length > 1 && (
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setExpandedAction(null); setResults(null); if (tab.key === 'iiq') { loadIiqStatuses(); loadIiqLocations() } }}
                className={`flex-1 py-3 text-sm font-bold transition ${
                  activeTab === tab.key
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Action List - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">

          {/* Results notification (inside panel) */}
          {results && (
            <div className={`p-3 rounded-lg border mb-3 ${
              results.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' :
              results.type === 'partial' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400' :
              'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}>
              <div className="flex items-center gap-2">
                {results.type === 'success' ? <CheckCircle className="h-4 w-4 flex-none" /> :
                 results.type === 'partial' ? <AlertTriangle className="h-4 w-4 flex-none" /> :
                 <AlertTriangle className="h-4 w-4 flex-none" />}
                <span className="text-sm font-medium">{results.message}</span>
              </div>
              {results.errors?.length > 0 && (
                <div className="mt-2 pl-6 space-y-1">
                  {results.errors.map((err, i) => (
                    <p key={i} className="text-xs font-mono">{err.serial}: {err.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No actions available message */}
          {!showGoogle && !showIiq && (
            <div className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">
              No actions available for {isSingle ? 'this device type' : 'the selected devices'}.
            </div>
          )}

          {/* ========= GOOGLE TAB ========= */}
          {activeTab === 'google' && (
            <>
              {/* Mixed selection banner */}
              {isMixedGoogle && (
                <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 text-xs mb-2">
                  <span className="font-bold">{googleCount}</span> of <span className="font-bold">{devices.length}</span> selected devices are Chromebooks — Google actions will apply to {googleCount} {googleCount === 1 ? 'device' : 'devices'}.
                </div>
              )}

              {/* Enable/Disable */}
              <ActionAccordion
                icon={isSingle && getDeviceField(device, 'google_status', 'google_devices__status')?.toUpperCase() === 'DISABLED' ? Power : PowerOff}
                label={isSingle ? (getDeviceField(device, 'google_status', 'google_devices__status')?.toUpperCase() === 'DISABLED' ? 'Enable Device' : 'Disable Device') : 'Enable / Disable'}
                currentValue={isSingle ? getDeviceField(device, 'google_status', 'google_devices__status') : null}
                expanded={expandedAction === 'enable-disable'}
                onToggle={() => toggleAction('enable-disable')}
              >
                {isSingle ? (
                  <button
                    onClick={() => handleGoogleAction(getDeviceField(device, 'google_status', 'google_devices__status')?.toUpperCase() === 'DISABLED' ? 'enable' : 'disable')}
                    disabled={actionLoading !== null}
                    className={`w-full py-2.5 rounded-lg text-sm font-bold transition disabled:opacity-50 ${
                      getDeviceField(device, 'google_status', 'google_devices__status')?.toUpperCase() === 'DISABLED'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> :
                      getDeviceField(device, 'google_status', 'google_devices__status')?.toUpperCase() === 'DISABLED' ? 'Enable' : 'Disable'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGoogleAction('enable')}
                      disabled={actionLoading !== null}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'enable' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Enable ${googleCount}`}
                    </button>
                    <button
                      onClick={() => handleGoogleAction('disable')}
                      disabled={actionLoading !== null}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'disable' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Disable ${googleCount}`}
                    </button>
                  </div>
                )}
                {!isSingle && <p className="text-xs text-slate-400 mt-2">Will apply to {googleCount} Chromebook{googleCount !== 1 ? 's' : ''}</p>}
              </ActionAccordion>

              {/* Reboot */}
              <ActionAccordion
                icon={RefreshCw}
                label="Reboot"
                expanded={expandedAction === 'reboot'}
                onToggle={() => toggleAction('reboot')}
              >
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Remotely restart {isSingle ? 'this device' : `${googleCount} Chromebook${googleCount !== 1 ? 's' : ''}`}.
                </p>
                <button
                  onClick={() => handleGoogleAction('reboot')}
                  disabled={actionLoading !== null}
                  className="w-full py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                >
                  {actionLoading === 'reboot' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Reboot ${isSingle ? 'Device' : googleCount + ' Devices'}`}
                </button>
                {!isSingle && <p className="text-xs text-slate-400 mt-2">Will apply to {googleCount} Chromebook{googleCount !== 1 ? 's' : ''}</p>}
              </ActionAccordion>

              {/* Move OU */}
              <ActionAccordion
                icon={FolderInput}
                label="Move OU"
                currentValue={isSingle ? getDeviceField(device, 'org_unit_path', 'google_devices__org_unit_path') : null}
                expanded={expandedAction === 'move-ou'}
                onToggle={() => toggleAction('move-ou')}
              >
                <input
                  type="text"
                  placeholder="Search organizational units..."
                  value={ouSearch}
                  onChange={(e) => { setOuSearch(e.target.value); setSelectedOU(null) }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {ouSearch && (
                  <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    {filteredOUs.length > 0 ? filteredOUs.map(ou => (
                      <button
                        key={ou}
                        onClick={() => { setSelectedOU(ou); setOuSearch(ou) }}
                        className={`w-full text-left px-3 py-2 text-xs font-mono hover:bg-blue-50 dark:hover:bg-blue-900/20 transition ${selectedOU === ou ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        {ou}
                      </button>
                    )) : <p className="px-3 py-2 text-sm text-slate-400">No matching org units</p>}
                  </div>
                )}
                {selectedOU && (
                  <button
                    onClick={() => handleGoogleAction('move-ou', { target_ou: selectedOU })}
                    disabled={actionLoading !== null}
                    className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                  >
                    {actionLoading === 'move-ou' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Move ${isSingle ? 'Device' : googleCount + ' Devices'}`}
                  </button>
                )}
                {!isSingle && selectedOU && <p className="text-xs text-slate-400 mt-1">Will apply to {googleCount} Chromebook{googleCount !== 1 ? 's' : ''}</p>}
              </ActionAccordion>

              {/* PowerWash */}
              <ActionAccordion
                icon={RotateCcw}
                label="PowerWash"
                danger
                expanded={expandedAction === 'powerwash'}
                onToggle={() => toggleAction('powerwash')}
              >
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Wipes all local data on {isSingle ? 'this device' : `${googleCount} Chromebook${googleCount !== 1 ? 's' : ''}`}. The device will reset to factory settings on its next online check-in and re-enroll automatically.
                </p>
                <button
                  onClick={() => handleGoogleAction('powerwash')}
                  disabled={actionLoading !== null}
                  className="w-full py-2.5 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50"
                >
                  {actionLoading === 'powerwash' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `PowerWash ${isSingle ? 'Device' : googleCount + ' Devices'}`}
                </button>
                {!isSingle && <p className="text-xs text-slate-400 mt-2">Will apply to {googleCount} Chromebook{googleCount !== 1 ? 's' : ''}</p>}
              </ActionAccordion>

              {/* Deprovision */}
              <ActionAccordion
                icon={Trash2}
                label="Deprovision"
                danger
                expanded={expandedAction === 'deprovision'}
                onToggle={() => toggleAction('deprovision')}
              >
                <p className="text-xs text-red-500 dark:text-red-400 mb-3">
                  Permanently removes {isSingle ? 'device' : `${googleCount} Chromebook${googleCount !== 1 ? 's' : ''}`} from Google management.
                </p>
                <select
                  value={deprovisionReason}
                  onChange={(e) => setDeprovisionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select a reason...</option>
                  <option value="same_model_replacement">Same model replacement</option>
                  <option value="different_model_replacement">Different model replacement</option>
                  <option value="retiring_device">Retiring device</option>
                </select>
                <input
                  type="text"
                  placeholder={isSingle ? getSerial(device) : 'Type CONFIRM'}
                  value={deprovisionConfirm}
                  onChange={(e) => setDeprovisionConfirm(e.target.value)}
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={() => handleGoogleAction('deprovision', { deprovision_reason: deprovisionReason })}
                  disabled={
                    actionLoading !== null ||
                    !deprovisionReason ||
                    (isSingle ? deprovisionConfirm !== getSerial(device) : deprovisionConfirm !== 'CONFIRM')
                  }
                  className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === 'deprovision' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Deprovision ${isSingle ? '' : googleCount + ' Devices'}`}
                </button>
              </ActionAccordion>
            </>
          )}

          {/* ========= IIQ TAB ========= */}
          {activeTab === 'iiq' && (
            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <FileText className="h-4 w-4 text-slate-400" />
                  Status
                  {isSingle && getDeviceField(device, 'iiq_status', 'iiq_assets__status') && (
                    <span className="font-normal text-xs text-slate-400 ml-auto truncate max-w-[180px]">{getDeviceField(device, 'iiq_status', 'iiq_assets__status')}</span>
                  )}
                </label>
                <select
                  value={iiqStatusValue}
                  onChange={(e) => setIiqStatusValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                >
                  <option value="">Select status...</option>
                  {iiqStatuses.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  Location
                  {isSingle && getDeviceField(device, 'location', 'iiq_assets__location') && (
                    <span className="font-normal text-xs text-slate-400 ml-auto truncate max-w-[180px]">{getDeviceField(device, 'location', 'iiq_assets__location')}</span>
                  )}
                </label>
                <select
                  value={iiqLocationValue}
                  onChange={(e) => setIiqLocationValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                >
                  <option value="">Select location...</option>
                  {iiqLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {/* Asset Tag (single only) */}
              {isSingle && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    <Tag className="h-4 w-4 text-slate-400" />
                    Asset Tag
                    {getDeviceField(device, 'asset_tag', 'iiq_assets__asset_tag', 'tag') && (
                      <span className="font-normal text-xs text-slate-400 ml-auto truncate max-w-[180px]">{getDeviceField(device, 'asset_tag', 'iiq_assets__asset_tag', 'tag')}</span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="New asset tag..."
                    value={iiqTagValue}
                    onChange={(e) => setIiqTagValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm"
                  />
                </div>
              )}

              {/* Assigned User (single only) */}
              {isSingle && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    <User className="h-4 w-4 text-slate-400" />
                    Assigned User
                    {getDeviceField(device, 'assigned_user_email', 'iiq_assets__assigned_user_email', 'assigned_user') && (
                      <span className="font-normal text-xs text-slate-400 ml-auto truncate max-w-[180px]">{getDeviceField(device, 'assigned_user_email', 'iiq_assets__assigned_user_email', 'assigned_user')}</span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="Search by name, email, or school ID..."
                    value={iiqUserSearch}
                    onChange={(e) => { setIiqUserSearch(e.target.value); setSelectedIiqUser(null) }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {iiqUserSearch && !selectedIiqUser && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                      {iiqUserLoading ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          <span className="ml-2 text-xs text-slate-400">Searching IIQ...</span>
                        </div>
                      ) : iiqUserResults.length > 0 ? iiqUserResults.map(u => (
                        <button
                          key={u.user_id}
                          onClick={() => { setSelectedIiqUser(u); setIiqUserSearch(u.name || u.email) }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
                        >
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{u.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {u.email}{u.school_id ? ` · ID: ${u.school_id}` : ''}
                          </p>
                        </button>
                      )) : iiqUserSearch.length >= 2 ? (
                        <p className="px-3 py-2 text-xs text-slate-400">No matching users found</p>
                      ) : null}
                    </div>
                  )}
                  {selectedIiqUser && (
                    <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">
                      Selected: {selectedIiqUser.name} ({selectedIiqUser.email})
                    </p>
                  )}
                </div>
              )}

              {/* Apply Changes button */}
              {!isSingle && <p className="text-xs text-slate-400">Will apply to {iiqEligible.length} device{iiqEligible.length !== 1 ? 's' : ''}</p>}
              <button
                onClick={handleIIQApply}
                disabled={!iiqHasChanges || actionLoading !== null}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'iiq-apply' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Apply Changes${!isSingle ? ' to ' + iiqEligible.length + ' Devices' : ''}`}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}

// --- Accordion sub-component ---
function ActionAccordion({ icon: Icon, label, currentValue, danger, expanded, onToggle, children }) {
  return (
    <div className={`rounded-xl border ${danger ? 'border-red-200 dark:border-red-900/50' : 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 p-3.5 text-left transition ${
          expanded
            ? danger ? 'bg-red-50 dark:bg-red-950/20' : 'bg-blue-50 dark:bg-blue-950/20'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <Icon className={`h-4 w-4 flex-none ${danger ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${danger ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>{label}</p>
          {currentValue && !expanded && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{currentValue}</p>
          )}
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 flex-none" /> : <ChevronRight className="h-4 w-4 text-slate-400 flex-none" />}
      </button>
      {expanded && (
        <div className="p-3.5 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}
