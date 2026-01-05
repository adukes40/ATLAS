import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import {
  FileText, Laptop, Clock, DollarSign, UserX, Users2,
  ChevronRight, Loader2, ArrowLeft, Wrench
} from 'lucide-react'

// Report Pages
import DeviceInventory from './DeviceInventory'
import AueReport from './AueReport'
import FeeBalances from './FeeBalances'
import NoChromebook from './NoChromebook'
import MultipleDevices from './MultipleDevices'
import CustomBuilder from './CustomBuilder'

// Report Card Component
function ReportCard({ icon: Icon, title, description, stat, color, onClick }) {
  const colorClasses = {
    blue: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700',
    amber: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700',
    emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700',
    red: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700',
    purple: 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700',
    slate: 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 hover:border-slate-300 dark:hover:border-slate-600'
  }

  const iconColors = {
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400',
    slate: 'text-slate-600 dark:text-slate-400'
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 p-5 transition-all cursor-pointer ${colorClasses[color]} hover:shadow-md`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-white dark:bg-slate-800 ${iconColors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </div>
      <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
        {title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        {description}
      </p>
      {stat && (
        <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
          {stat}
        </div>
      )}
    </button>
  )
}

// Reports Index (Card Grid)
function ReportsHome() {
  const navigate = useNavigate()
  const [summaries, setSummaries] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSummaries = async () => {
      try {
        const res = await axios.get('/api/reports/summaries')
        setSummaries(res.data)
      } catch (err) {
        console.error('Failed to fetch report summaries:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchSummaries()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-6 w-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Reports</h1>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Generate and export device, user, and financial reports
        </p>
      </div>

      {/* Pre-Built Reports Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Pre-Built Reports
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={Laptop}
            title="Device Inventory"
            description="All devices with assigned user info"
            stat={summaries?.device_inventory?.label}
            color="blue"
            onClick={() => navigate('/reports/device-inventory')}
          />
          <ReportCard
            icon={Clock}
            title="AUE / End-of-Life"
            description="Chromebooks by expiration date"
            stat={summaries?.aue_eol?.label}
            color="amber"
            onClick={() => navigate('/reports/aue-eol')}
          />
          <ReportCard
            icon={DollarSign}
            title="Fee Balances"
            description="Users with outstanding fees"
            stat={summaries?.fee_balances?.label}
            color="emerald"
            onClick={() => navigate('/reports/fee-balances')}
          />
          <ReportCard
            icon={UserX}
            title="No Chromebook"
            description="Active students without a device"
            stat={summaries?.no_chromebook?.label}
            color="red"
            onClick={() => navigate('/reports/no-chromebook')}
          />
          <ReportCard
            icon={Users2}
            title="Multiple Devices"
            description="Users with more than one device"
            stat={summaries?.multiple_devices?.label}
            color="purple"
            onClick={() => navigate('/reports/multiple-devices')}
          />
        </div>
      </section>

      {/* Custom Report Builder Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
          Custom Report Builder
        </h2>
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
             onClick={() => navigate('/reports/custom')}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <Wrench className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                Build a Custom Report
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select a data source, choose columns, apply filters, and export your custom report
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </div>
        </div>
      </section>
    </div>
  )
}

// Back Button Component
function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/reports')}
      className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-4"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="text-sm font-medium">Back to Reports</span>
    </button>
  )
}

// Main Reports Router
export default function ReportsIndex() {
  const location = useLocation()
  const isHome = location.pathname === '/reports' || location.pathname === '/reports/'

  return (
    <div>
      {!isHome && <BackButton />}
      <Routes>
        <Route path="/" element={<ReportsHome />} />
        <Route path="/device-inventory" element={<DeviceInventory />} />
        <Route path="/aue-eol" element={<AueReport />} />
        <Route path="/fee-balances" element={<FeeBalances />} />
        <Route path="/no-chromebook" element={<NoChromebook />} />
        <Route path="/multiple-devices" element={<MultipleDevices />} />
        <Route path="/custom" element={<CustomBuilder />} />
      </Routes>
    </div>
  )
}
