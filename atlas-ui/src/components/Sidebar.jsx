import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Laptop,
  FileText,
  Wrench,
  Settings,
  Menu,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  MoreVertical,
  Hammer,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

const preBuiltReports = [
  { to: '/reports/overview', label: 'Overview' },
  { to: '/reports/device-inventory', label: 'Device Inventory' },
  { to: '/reports/aue-eol', label: 'AUE / End-of-Life' },
  { to: '/reports/fee-balances', label: 'Fee Balances' },
  { to: '/reports/no-chromebook', label: 'No Chromebook' },
  { to: '/reports/multiple-devices', label: 'Multiple Devices' },
  { to: '/reports/infrastructure-inventory', label: 'Infrastructure' },
  { to: '/reports/firmware-compliance', label: 'Firmware Compliance' },
]

const adminItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const activeClass = 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
const inactiveClass = 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(true)
  const [savedReports, setSavedReports] = useState([])
  const [openFolders, setOpenFolders] = useState({})
  const [contextMenu, setContextMenu] = useState(null)

  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const location = useLocation()
  const isReportsActive = location.pathname.startsWith('/reports')

  // Fetch saved reports on mount and on custom event
  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const res = await axios.get('/api/reports/saved')
        setSavedReports(res.data)
      } catch {
        // silently ignore
      }
    }
    fetchSaved()
    const handleUpdate = () => fetchSaved()
    window.addEventListener('atlas-saved-reports-changed', handleUpdate)
    return () => window.removeEventListener('atlas-saved-reports-changed', handleUpdate)
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handler = () => setContextMenu(null)
      document.addEventListener('click', handler)
      return () => document.removeEventListener('click', handler)
    }
  }, [contextMenu])

  const folders = [...new Set(savedReports.filter(r => r.folder).map(r => r.folder))]
  const ungrouped = savedReports.filter(r => !r.folder)

  const toggleFolder = (folderName) => {
    setOpenFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }))
  }

  const dispatchRefresh = () => {
    window.dispatchEvent(new Event('atlas-saved-reports-changed'))
  }

  const handleRename = async (report) => {
    const newName = prompt('Rename report:', report.name)
    if (!newName || newName === report.name) return
    try {
      await axios.put(`/api/reports/saved/${report.id}`, { name: newName })
      dispatchRefresh()
    } catch { /* ignore */ }
  }

  const handleMoveToFolder = async (report) => {
    const folder = prompt('Move to folder (leave empty to remove from folder):', report.folder || '')
    if (folder === null) return
    try {
      await axios.put(`/api/reports/saved/${report.id}`, { folder: folder || null })
      dispatchRefresh()
    } catch { /* ignore */ }
  }

  const handleDuplicate = async (report) => {
    try {
      await axios.post('/api/reports/saved', {
        name: `${report.name} (copy)`,
        folder: report.folder || null,
        config: report.config,
      })
      dispatchRefresh()
    } catch { /* ignore */ }
  }

  const handleDelete = async (report) => {
    if (!window.confirm(`Delete "${report.name}"?`)) return
    try {
      await axios.delete(`/api/reports/saved/${report.id}`)
      dispatchRefresh()
    } catch { /* ignore */ }
  }

  const linkClass = (isActive) =>
    `flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group ${isActive ? activeClass : inactiveClass}`

  const subLinkClass = (isActive) =>
    `flex items-center pl-9 pr-3 py-1.5 rounded-lg transition-all duration-200 group text-xs ${isActive ? activeClass : inactiveClass}`

  const labelSpan = (label) => (
    <span
      className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
        expanded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {label}
    </span>
  )

  const renderSavedReportItem = (report) => (
    <div key={report.id} className="relative group/saved flex items-center">
      <NavLink
        to={`/reports/saved/${report.id}`}
        title={report.name}
        className={({ isActive }) => subLinkClass(isActive) + ' flex-1 min-w-0'}
      >
        <span className="truncate max-w-[140px]">{report.name}</span>
      </NavLink>
      {expanded && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setContextMenu(
              contextMenu?.reportId === report.id
                ? null
                : { reportId: report.id, x: e.clientX, y: e.clientY, report }
            )
          }}
          className="opacity-0 group-hover/saved:opacity-100 absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-opacity"
        >
          <MoreVertical className="h-3.5 w-3.5 text-slate-400" />
        </button>
      )}
    </div>
  )

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50 transition-all duration-300 ease-in-out ${
        expanded ? 'w-52' : 'w-14'
      }`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { setExpanded(false); setContextMenu(null) }}
    >
      {/* Logo/Menu Section */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
        <Menu className="h-5 w-5 text-slate-400 flex-shrink-0" />
        <span
          className={`ml-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          ATLAS
        </span>
      </div>

      {/* Navigation */}
      <nav className="mt-4 px-2 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 100px)' }}>
        {/* Device 360 */}
        <NavLink to="/" end className={({ isActive }) => linkClass(isActive)}>
          <Laptop className="h-5 w-5 flex-shrink-0" />
          {labelSpan('Device 360')}
        </NavLink>

        {/* Reports Section */}
        {expanded ? (
          <button
            onClick={() => setReportsOpen(prev => !prev)}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group ${
              isReportsActive ? activeClass : inactiveClass
            }`}
          >
            <FileText className="h-5 w-5 flex-shrink-0" />
            <span className="ml-3 text-sm font-medium whitespace-nowrap flex-1 text-left">Reports</span>
            {reportsOpen ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
          </button>
        ) : (
          <NavLink
            to="/reports/overview"
            className={({ isActive }) => linkClass(isActive || isReportsActive)}
          >
            <FileText className="h-5 w-5 flex-shrink-0" />
            <span className="ml-3 text-sm font-medium whitespace-nowrap opacity-0">Reports</span>
          </NavLink>
        )}

        {/* Reports Sub-items */}
        {expanded && reportsOpen && (
          <div className="space-y-0.5">
            {/* Pre-Built Reports */}
            {preBuiltReports.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                title={label}
                className={({ isActive }) => subLinkClass(isActive)}
              >
                <span className="truncate max-w-[140px]">{label}</span>
              </NavLink>
            ))}

            {/* Tools Divider */}
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
              <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">Tools</span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
            </div>

            {/* Custom Builder */}
            <NavLink
              to="/reports/custom"
              title="Custom Builder"
              className={({ isActive }) => subLinkClass(isActive)}
            >
              <Hammer className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
              <span className="truncate max-w-[140px]">Custom Builder</span>
            </NavLink>

            {/* Saved Reports */}
            {savedReports.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">Saved Reports</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                </div>

                {/* Folders */}
                {folders.map(folderName => (
                  <div key={folderName}>
                    <button
                      onClick={() => toggleFolder(folderName)}
                      className="w-full flex items-center pl-9 pr-3 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                      {openFolders[folderName] ? (
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                      ) : (
                        <FolderClosed className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                      )}
                      <span className="truncate max-w-[120px] font-medium">{folderName}</span>
                    </button>
                    {openFolders[folderName] && (
                      <div className="ml-3 space-y-0.5">
                        {savedReports
                          .filter(r => r.folder === folderName)
                          .map(report => renderSavedReportItem(report))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Ungrouped saved reports */}
                {ungrouped.map(report => renderSavedReportItem(report))}
              </>
            )}
          </div>
        )}

        {/* Utilities */}
        <NavLink to="/utilities" className={({ isActive }) => linkClass(isActive)}>
          <Wrench className="h-5 w-5 flex-shrink-0" />
          {labelSpan('Utilities')}
        </NavLink>

        {/* Admin-only items */}
        {isAdmin && (
          <>
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800" />
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => linkClass(isActive)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {labelSpan(label)}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Version indicator at bottom */}
      <div className="absolute bottom-4 left-0 right-0 px-4">
        <div
          className={`text-[10px] text-slate-400 dark:text-slate-600 transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          v1.0.0
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-[100] min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { handleRename(contextMenu.report); setContextMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Rename
          </button>
          <button
            onClick={() => { handleMoveToFolder(contextMenu.report); setContextMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Move to Folder
          </button>
          <button
            onClick={() => { handleDuplicate(contextMenu.report); setContextMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Duplicate
          </button>
          <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
          <button
            onClick={() => { handleDelete(contextMenu.report); setContextMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  )
}
