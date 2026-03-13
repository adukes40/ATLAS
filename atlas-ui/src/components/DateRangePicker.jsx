import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function CalendarPanel({ value, onChange, minDate, maxDate, label }) {
  const today = new Date()
  const selected = value ? new Date(value + 'T00:00:00') : null
  const [viewYear, setViewYear] = useState(selected?.getFullYear() || today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() || today.getMonth())

  const days = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const startDay = first.getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

    const cells = []
    // Previous month padding
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ day: daysInPrev - i, current: false, date: null })
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, current: true, date: dateStr })
    }
    // Next month padding
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, current: false, date: null })
    }
    return cells
  }, [viewYear, viewMonth])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const isSelected = (dateStr) => dateStr && value === dateStr
  const isToday = (dateStr) => {
    if (!dateStr) return false
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return dateStr === t
  }

  const isDisabled = (dateStr) => {
    if (!dateStr) return true
    if (minDate && dateStr < minDate) return true
    if (maxDate && dateStr > maxDate) return true
    return false
  }

  return (
    <div className="w-[260px]">
      {/* Month/Year nav */}
      <div className="flex items-center justify-between px-2 pb-2">
        <button type="button" onClick={prevMonth} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
          <ChevronLeft className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </button>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
          <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((cell, i) => {
          const disabled = isDisabled(cell.date)
          const sel = isSelected(cell.date)
          const tod = isToday(cell.date)

          return (
            <button
              key={i}
              type="button"
              disabled={disabled || !cell.current}
              onClick={() => cell.date && !disabled && onChange(cell.date)}
              className={`
                h-8 w-full text-xs rounded-md transition-all
                ${!cell.current ? 'text-slate-300 dark:text-slate-600 cursor-default' : ''}
                ${cell.current && !sel && !disabled ? 'text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer' : ''}
                ${cell.current && disabled ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : ''}
                ${sel ? 'bg-blue-500 text-white font-bold hover:bg-blue-600 shadow-sm' : ''}
                ${tod && !sel ? 'ring-1 ring-blue-400 font-semibold' : ''}
              `}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 pt-2 mt-1 border-t border-slate-100 dark:border-slate-600">
        <button
          type="button"
          onClick={() => {
            const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            onChange(t)
          }}
          className="flex-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          Today
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export default function DateRangePicker({ label, dateFrom, dateTo, onChange }) {
  const [openPanel, setOpenPanel] = useState(null) // 'from' | 'to' | null
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenPanel(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formatDisplay = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const hasValue = dateFrom || dateTo

  return (
    <div className="flex flex-col gap-1 relative flex-shrink-0" ref={containerRef}>
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide truncate max-w-[260px]">
        {label}
      </label>

      <div className="flex items-center gap-0">
        {/* From button */}
        <button
          type="button"
          onClick={() => setOpenPanel(openPanel === 'from' ? null : 'from')}
          className={`h-9 pl-2.5 pr-2 text-xs rounded-l-lg border bg-white dark:bg-slate-700 flex items-center gap-1.5 transition-all ${
            openPanel === 'from'
              ? 'border-blue-400 ring-2 ring-blue-500/20 z-10'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className={`${dateFrom ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
            {formatDisplay(dateFrom) || 'Start date'}
          </span>
        </button>

        {/* Divider */}
        <div className="h-9 flex items-center px-1.5 border-y border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800">
          <span className="text-[10px] text-slate-400 font-medium">to</span>
        </div>

        {/* To button */}
        <button
          type="button"
          onClick={() => setOpenPanel(openPanel === 'to' ? null : 'to')}
          className={`h-9 pl-2 pr-2.5 text-xs border bg-white dark:bg-slate-700 flex items-center gap-1.5 transition-all ${
            hasValue ? 'rounded-none' : 'rounded-r-lg'
          } ${
            openPanel === 'to'
              ? 'border-blue-400 ring-2 ring-blue-500/20 z-10'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className={`${dateTo ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
            {formatDisplay(dateTo) || 'End date'}
          </span>
        </button>

        {/* Clear button */}
        {hasValue && (
          <button
            type="button"
            onClick={() => { onChange(null, null); setOpenPanel(null) }}
            className="h-9 px-1.5 rounded-r-lg border border-l-0 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          >
            <X className="h-3 w-3 text-slate-400" />
          </button>
        )}
      </div>

      {/* Calendar popover */}
      {openPanel && (
        <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 z-50 p-3">
          <CalendarPanel
            value={openPanel === 'from' ? dateFrom : dateTo}
            onChange={(val) => {
              if (openPanel === 'from') {
                onChange(val, dateTo)
                // Auto-advance to end date if no end date set
                if (val && !dateTo) setTimeout(() => setOpenPanel('to'), 150)
                else setOpenPanel(null)
              } else {
                onChange(dateFrom, val)
                setOpenPanel(null)
              }
            }}
            minDate={openPanel === 'to' ? dateFrom : undefined}
            maxDate={openPanel === 'from' ? dateTo : undefined}
            label={openPanel === 'from' ? 'Start Date' : 'End Date'}
          />
        </div>
      )}
    </div>
  )
}
