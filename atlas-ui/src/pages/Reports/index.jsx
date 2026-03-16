import { Routes, Route, Navigate } from 'react-router-dom'
import NotFound from '../NotFound'

// Report Pages
import Overview from './Overview'
import UnifiedReportView from './UnifiedReportView'

// Main Reports Router
export default function ReportsIndex() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Navigate to="/reports/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/device-inventory" element={<UnifiedReportView systemSlug="device-inventory" />} />
        <Route path="/aue-eol" element={<UnifiedReportView systemSlug="aue-eol" />} />
        <Route path="/fee-balances" element={<UnifiedReportView systemSlug="fee-balances" />} />
        <Route path="/no-chromebook" element={<UnifiedReportView systemSlug="no-chromebook" />} />
        <Route path="/multiple-devices" element={<UnifiedReportView systemSlug="multiple-devices" />} />
        <Route path="/infrastructure-inventory" element={<UnifiedReportView systemSlug="infrastructure-inventory" />} />
        <Route path="/firmware-compliance" element={<UnifiedReportView systemSlug="firmware-compliance" />} />
        <Route path="/custom" element={<UnifiedReportView isNew />} />
        <Route path="/saved/:id" element={<UnifiedReportView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}
