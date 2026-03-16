import { useState, useRef } from 'react'
import {
  X, ChevronDown, ChevronRight, GripVertical,
  Search, Check, AlertTriangle
} from 'lucide-react'

// Platform color mapping
const PLATFORM_MAP = {
  iiq_assets: 'iiq', iiq_users: 'iiq', iiq_tickets: 'iiq',
  google_devices: 'google', google_users: 'google',
  meraki_devices: 'meraki', meraki_networks: 'meraki',
  meraki_clients: 'meraki', network_cache: 'meraki',
}

const DOT_COLORS = {
  iiq: 'bg-blue-500',
  google: 'bg-emerald-500',
  meraki: 'bg-purple-500',
}

const getDotColor = (source) => {
  const platform = PLATFORM_MAP[source]
  return DOT_COLORS[platform] || 'bg-slate-400'
}

const BORDER_COLORS = {
  iiq: 'border-l-blue-500',
  google: 'border-l-emerald-500',
  meraki: 'border-l-purple-500',
}

export default function ColumnPickerPanel({
  visible,
  onClose,
  availableSources,
  activeColumns,
  onAddColumn,
  onRemoveColumn,
  onReorderColumns,
  allowedSources,
}) {
  const [expandedSources, setExpandedSources] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  const toggleSource = (source) => {
    setExpandedSources(prev => ({ ...prev, [source]: !prev[source] }))
  }

  const isColumnActive = (source, field) => {
    return activeColumns.some(c => c.source === source && c.field === field)
  }

  const handleToggleColumn = (source, field) => {
    if (isColumnActive(source, field)) {
      onRemoveColumn(source, field)
    } else {
      onAddColumn(source, field)
    }
  }

  // Drag & drop for reorder
  const handleDragStart = (idx) => {
    dragItem.current = idx
  }

  const handleDragEnter = (idx) => {
    dragOverItem.current = idx
  }

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) return

    const items = [...activeColumns]
    const draggedItem = items[dragItem.current]
    items.splice(dragItem.current, 1)
    items.splice(dragOverItem.current, 0, draggedItem)
    onReorderColumns(items)

    dragItem.current = null
    dragOverItem.current = null
  }

  // Filter sources by search and allowedSources
  const filteredSources = Object.entries(availableSources)
    .filter(([key]) => !allowedSources || allowedSources.includes(key))
    .map(([sourceKey, sourceData]) => {
      const cols = sourceData.columns || []
      const filtered = searchQuery
        ? cols.filter(c =>
            c.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.key.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : cols
      return { sourceKey, ...sourceData, filteredColumns: filtered }
    })
    .filter(s => !searchQuery || s.filteredColumns.length > 0)

  return (
    <>
      {/* Backdrop */}
      {visible && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-[420px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Columns</h2>
            <p className="text-xs text-slate-500 mt-0.5">{activeColumns.length} selected</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search columns..."
              className="w-full pl-10 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Active columns (drag to reorder) */}
        {activeColumns.length > 0 && !searchQuery && (
          <div className="border-b border-slate-200 dark:border-slate-700">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/30">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Columns (drag to reorder)</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {activeColumns.map((col, idx) => {
                const sourceInfo = availableSources[col.source]
                const colInfo = sourceInfo?.columns?.find(c => c.key === col.field)
                return (
                  <div
                    key={`${col.source}__${col.field}`}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragEnter={() => handleDragEnter(idx)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-move group border-b border-slate-100 dark:border-slate-800"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 flex-none" />
                    <div className={`w-2 h-2 rounded-full flex-none ${getDotColor(col.source)}`} />
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">
                      {colInfo?.label || col.field}
                    </span>
                    <span className="text-[10px] text-slate-400 flex-none">{sourceInfo?.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveColumn(col.source, col.field) }}
                      className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition flex-none"
                    >
                      <X className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Available sources/columns */}
        <div className="flex-1 overflow-y-auto">
          {filteredSources.map(({ sourceKey, label, filteredColumns }) => {
            const platform = PLATFORM_MAP[sourceKey]
            const isExpanded = expandedSources[sourceKey] || !!searchQuery
            const borderColor = BORDER_COLORS[platform] || 'border-l-slate-400'
            const activeCount = filteredColumns.filter(c => isColumnActive(sourceKey, c.key)).length

            return (
              <div key={sourceKey} className={`border-l-4 ${borderColor}`}>
                <button
                  onClick={() => toggleSource(sourceKey)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 text-slate-400 flex-none" />
                    : <ChevronRight className="h-4 w-4 text-slate-400 flex-none" />
                  }
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200 flex-1">{label}</span>
                  {activeCount > 0 && (
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      {activeCount}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{filteredColumns.length}</span>
                </button>

                {isExpanded && (
                  <div className="pb-1">
                    {filteredColumns.map(col => {
                      const active = isColumnActive(sourceKey, col.key)
                      return (
                        <button
                          key={col.key}
                          onClick={() => handleToggleColumn(sourceKey, col.key)}
                          className="w-full flex items-center gap-2.5 px-4 pl-10 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${
                            active
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {active && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className={`text-sm flex-1 ${active ? 'text-slate-800 dark:text-slate-200 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                            {col.label}
                          </span>
                          <span className="text-[10px] text-slate-400 flex-none">{col.type}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {filteredSources.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              {searchQuery ? 'No columns match your search' : 'No sources available'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}
