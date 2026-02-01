import { Wrench, X, CheckSquare } from 'lucide-react'

export default function BulkActionBar({ count, totalOnPage, onSelectAll, onClear, onBulkAction }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-6 py-3 bg-slate-800 dark:bg-slate-700 text-white rounded-xl shadow-2xl border border-slate-700 dark:border-slate-600 animate-in slide-in-from-bottom-4 duration-300">
      <span className="text-sm font-bold">
        {count} device{count !== 1 ? 's' : ''} selected
      </span>

      <div className="h-5 w-px bg-slate-600" />

      <button
        onClick={onSelectAll}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
      >
        <CheckSquare className="h-3.5 w-3.5" />
        Select All on Page ({totalOnPage})
      </button>

      <button
        onClick={onClear}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </button>

      <div className="h-5 w-px bg-slate-600" />

      <button
        onClick={onBulkAction}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition shadow-sm"
      >
        <Wrench className="h-4 w-4" />
        Bulk Actions
      </button>
    </div>
  )
}
