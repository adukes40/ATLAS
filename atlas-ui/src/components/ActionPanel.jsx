import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  X, Power, PowerOff, FolderInput, Trash2, Loader2,
  AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
  Monitor, Tag, MapPin, User, FileText
} from 'lucide-react'
import { useIntegrations } from '../context/IntegrationsContext'

export default function ActionPanel({ devices, onClose }) {
  const { integrations } = useIntegrations()
  const [activeTab, setActiveTab] = useState(integrations.google ? 'google' : 'iiq')
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
  const [iiqStatusValue, setIiqStatusValue] = useState('')
  const [iiqLocationValue, setIiqLocationValue] = useState('')
  const [iiqTagValue, setIiqTagValue] = useState('')
  const [iiqUserSearch, setIiqUserSearch] = useState('')

  const isSingle = devices.length === 1
  const device = isSingle ? devices[0] : null

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
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

  const filteredOUs = orgUnits.filter(ou =>
    ou.toLowerCase().includes(ouSearch.toLowerCase())
  )

  // Toggle accordion
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
    const serial = device.serial_number || device.serial
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
  const handleBulkAction = async (endpoint, body = {}) => {
    const serials = devices.map(d => d.serial_number || d.serial)
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

  // --- IIQ SINGLE ACTIONS ---
  const handleIIQSingleAction = async (field, value) => {
    const serial = device.serial_number || device.serial
    setActionLoading(`iiq-${field}`)
    setResults(null)
    try {
      await axios.post(`/api/device/${serial}/iiq/update-${field}`, { value })
      setResults({ type: 'success', message: `${field} updated successfully. Click Force Refresh to see updated values.` })
    } catch (err) {
      setResults({ type: 'error', message: err.response?.data?.detail || err.message })
    } finally {
      setActionLoading(null)
    }
  }

  // --- IIQ BULK ACTIONS ---
  const handleIIQBulkAction = async (field, value) => {
    const serials = devices.map(d => d.serial_number || d.serial)
    setActionLoading(`iiq-${field}`)
    setResults(null)
    try {
      const res = await axios.post(`/api/bulk/iiq/update-${field}`, { serials, value })
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

  // Dispatch to single or bulk
  const handleGoogleAction = (endpoint, body = {}) => {
    if (isSingle) handleSingleAction(endpoint, body)
    else handleBulkAction(endpoint, body)
  }

  const handleIIQAction = (field, value) => {
    if (isSingle) handleIIQSingleAction(field, value)
    else handleIIQBulkAction(field, value)
  }

  // Count tabs to show
  const tabs = []
  if (integrations.google) tabs.push({ key: 'google', label: 'Google' })
  if (integrations.iiq) tabs.push({ key: 'iiq', label: 'IIQ' })

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
                {device.serial_number || device.serial}
                {(device.asset_tag || device.tag) && <span className="text-slate-400 ml-2">({device.asset_tag || device.tag})</span>}
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-0.5">
                <span className="font-bold text-slate-700 dark:text-slate-300">{devices.length}</span> devices selected
              </p>
            )}
          </div>
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
                onClick={() => { setActiveTab(tab.key); setExpandedAction(null); setResults(null) }}
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

          {/* ========= GOOGLE TAB ========= */}
          {activeTab === 'google' && (
            <>
              {/* Enable/Disable */}
              <ActionAccordion
                icon={isSingle && device.google_status?.toUpperCase() === 'DISABLED' ? Power : PowerOff}
                label={isSingle ? (device.google_status?.toUpperCase() === 'DISABLED' ? 'Enable Device' : 'Disable Device') : 'Enable / Disable'}
                currentValue={isSingle ? device.google_status : null}
                expanded={expandedAction === 'enable-disable'}
                onToggle={() => toggleAction('enable-disable')}
              >
                {isSingle ? (
                  <button
                    onClick={() => handleGoogleAction(device.google_status?.toUpperCase() === 'DISABLED' ? 'enable' : 'disable')}
                    disabled={actionLoading !== null}
                    className={`w-full py-2.5 rounded-lg text-sm font-bold transition disabled:opacity-50 ${
                      device.google_status?.toUpperCase() === 'DISABLED'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> :
                      device.google_status?.toUpperCase() === 'DISABLED' ? 'Enable' : 'Disable'}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGoogleAction('enable')}
                      disabled={actionLoading !== null}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'enable' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Enable ${devices.length}`}
                    </button>
                    <button
                      onClick={() => handleGoogleAction('disable')}
                      disabled={actionLoading !== null}
                      className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'disable' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Disable ${devices.length}`}
                    </button>
                  </div>
                )}
                {!isSingle && <p className="text-xs text-slate-400 mt-2">Will apply to {devices.length} devices</p>}
              </ActionAccordion>

              {/* Move OU */}
              <ActionAccordion
                icon={FolderInput}
                label="Move OU"
                currentValue={isSingle ? device.org_unit_path : null}
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
                    {actionLoading === 'move-ou' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Move ${isSingle ? 'Device' : devices.length + ' Devices'}`}
                  </button>
                )}
                {!isSingle && selectedOU && <p className="text-xs text-slate-400 mt-1">Will apply to {devices.length} devices</p>}
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
                  Permanently removes {isSingle ? 'device' : `${devices.length} devices`} from Google management.
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
                  placeholder={isSingle ? (device.serial_number || device.serial) : 'Type CONFIRM'}
                  value={deprovisionConfirm}
                  onChange={(e) => setDeprovisionConfirm(e.target.value)}
                  className="w-full mt-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={() => handleGoogleAction('deprovision', { deprovision_reason: deprovisionReason })}
                  disabled={
                    actionLoading !== null ||
                    !deprovisionReason ||
                    (isSingle ? deprovisionConfirm !== (device.serial_number || device.serial) : deprovisionConfirm !== 'CONFIRM')
                  }
                  className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === 'deprovision' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Deprovision ${isSingle ? '' : devices.length + ' Devices'}`}
                </button>
              </ActionAccordion>
            </>
          )}

          {/* ========= IIQ TAB ========= */}
          {activeTab === 'iiq' && (
            <>
              {/* Update Status (single + bulk) */}
              <ActionAccordion
                icon={FileText}
                label="Update Status"
                currentValue={isSingle ? device.iiq_status : null}
                expanded={expandedAction === 'iiq-status'}
                onToggle={() => toggleAction('iiq-status')}
              >
                <select
                  value={iiqStatusValue}
                  onChange={(e) => setIiqStatusValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                >
                  <option value="">Select status...</option>
                  <option value="Deployed">Deployed</option>
                  <option value="In Stock">In Stock</option>
                  <option value="In Repair">In Repair</option>
                  <option value="Retired">Retired</option>
                  <option value="Lost/Stolen">Lost/Stolen</option>
                </select>
                {iiqStatusValue && (
                  <button
                    onClick={() => handleIIQAction('status', iiqStatusValue)}
                    disabled={actionLoading !== null}
                    className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                  >
                    {actionLoading === 'iiq-status' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Apply ${!isSingle ? 'to ' + devices.length + ' Devices' : ''}`}
                  </button>
                )}
                {!isSingle && iiqStatusValue && <p className="text-xs text-slate-400 mt-1">Will apply to {devices.length} devices</p>}
              </ActionAccordion>

              {/* Update Location (single + bulk) */}
              <ActionAccordion
                icon={MapPin}
                label="Update Location"
                currentValue={isSingle ? device.location : null}
                expanded={expandedAction === 'iiq-location'}
                onToggle={() => toggleAction('iiq-location')}
              >
                <input
                  type="text"
                  placeholder="Type location name..."
                  value={iiqLocationValue}
                  onChange={(e) => setIiqLocationValue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                />
                {iiqLocationValue && (
                  <button
                    onClick={() => handleIIQAction('location', iiqLocationValue)}
                    disabled={actionLoading !== null}
                    className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                  >
                    {actionLoading === 'iiq-location' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `Apply ${!isSingle ? 'to ' + devices.length + ' Devices' : ''}`}
                  </button>
                )}
              </ActionAccordion>

              {/* Update Asset Tag (single only) */}
              {isSingle && (
                <ActionAccordion
                  icon={Tag}
                  label="Update Asset Tag"
                  currentValue={device.asset_tag || device.tag}
                  expanded={expandedAction === 'iiq-tag'}
                  onToggle={() => toggleAction('iiq-tag')}
                >
                  <input
                    type="text"
                    placeholder="New asset tag..."
                    value={iiqTagValue}
                    onChange={(e) => setIiqTagValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm"
                  />
                  {iiqTagValue && (
                    <button
                      onClick={() => handleIIQAction('asset-tag', iiqTagValue)}
                      disabled={actionLoading !== null}
                      className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'iiq-asset-tag' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Update Tag'}
                    </button>
                  )}
                </ActionAccordion>
              )}

              {/* Update Assigned User (single only) */}
              {isSingle && (
                <ActionAccordion
                  icon={User}
                  label="Update Assigned User"
                  currentValue={device.assigned_user_email || device.assigned_user}
                  expanded={expandedAction === 'iiq-user'}
                  onToggle={() => toggleAction('iiq-user')}
                >
                  <input
                    type="text"
                    placeholder="Search by email..."
                    value={iiqUserSearch}
                    onChange={(e) => setIiqUserSearch(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                  />
                  {iiqUserSearch && (
                    <button
                      onClick={() => handleIIQAction('assigned-user', iiqUserSearch)}
                      disabled={actionLoading !== null}
                      className="w-full mt-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                    >
                      {actionLoading === 'iiq-assigned-user' ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Assign User'}
                    </button>
                  )}
                </ActionAccordion>
              )}
            </>
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
