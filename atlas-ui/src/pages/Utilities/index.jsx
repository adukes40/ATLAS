import { Settings, Wrench } from 'lucide-react'

export default function UtilitiesIndex() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Settings className="h-6 w-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Utilities</h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          System utilities and tools
        </p>
      </div>

      {/* Placeholder */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
        <Wrench className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
        <h2 className="text-lg font-medium text-slate-600 dark:text-slate-300 mb-2">
          Additional Utilities Coming Soon
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Sync controls have moved to each integration's Settings page.
          Visit Settings &gt; IIQ, Google, or Meraki to manage syncs.
        </p>
      </div>
    </div>
  )
}
