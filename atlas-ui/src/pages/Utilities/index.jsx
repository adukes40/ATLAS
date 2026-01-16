import { Routes, Route, Link } from 'react-router-dom'
import { Wrench, Network, Search, Cpu } from 'lucide-react'
import SubnetCalculator from './SubnetCalculator'
import MacAddressLookup from './MacAddressLookup'
import BulkDeviceLookup from './BulkDeviceLookup'

// Tool card component
function ToolCard({ to, icon: Icon, title, description, color }) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  }

  return (
    <Link
      to={to}
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {description}
          </p>
        </div>
      </div>
    </Link>
  )
}

// Utilities landing page
function UtilitiesLanding() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <Wrench className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Utilities
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              IT tools and calculators
            </p>
          </div>
        </div>
      </div>

      {/* Tool Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ToolCard
          to="/utilities/subnet-calculator"
          icon={Network}
          title="Subnet Calculator"
          description="Calculate network address, broadcast, usable hosts from IP and CIDR"
          color="blue"
        />
        <ToolCard
          to="/utilities/mac-lookup"
          icon={Search}
          title="MAC Address Lookup"
          description="Identify device vendor from MAC address using OUI database"
          color="emerald"
        />
        <ToolCard
          to="/utilities/bulk-lookup"
          icon={Cpu}
          title="Bulk Device Lookup"
          description="Look up multiple devices at once by serial or asset tag"
          color="amber"
        />
      </div>

      {/* Coming Soon Section */}
      <div className="mt-8">
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
          More tools coming soon
        </h2>
        <div className="text-sm text-slate-400 dark:text-slate-500">
          Have a tool idea? Let us know!
        </div>
      </div>
    </div>
  )
}

export default function UtilitiesIndex() {
  return (
    <Routes>
      <Route path="/" element={<UtilitiesLanding />} />
      <Route path="/subnet-calculator" element={<SubnetCalculator />} />
      <Route path="/mac-lookup" element={<MacAddressLookup />} />
      <Route path="/bulk-lookup" element={<BulkDeviceLookup />} />
    </Routes>
  )
}
