import { Routes, Route, Navigate } from 'react-router-dom'

// Report Pages
import Overview from './Overview'
import DeviceInventory from './DeviceInventory'
import AueReport from './AueReport'
import FeeBalances from './FeeBalances'
import NoChromebook from './NoChromebook'
import MultipleDevices from './MultipleDevices'
import CustomBuilder from './CustomBuilder'
import SavedReportViewer from './SavedReportViewer'
import InfrastructureInventory from './InfrastructureInventory'
import FirmwareCompliance from './FirmwareCompliance'

// Main Reports Router
export default function ReportsIndex() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Navigate to="/reports/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/device-inventory" element={<DeviceInventory />} />
        <Route path="/aue-eol" element={<AueReport />} />
        <Route path="/fee-balances" element={<FeeBalances />} />
        <Route path="/no-chromebook" element={<NoChromebook />} />
        <Route path="/multiple-devices" element={<MultipleDevices />} />
        <Route path="/custom" element={<CustomBuilder />} />
        <Route path="/saved/:id" element={<SavedReportViewer />} />
        <Route path="/infrastructure-inventory" element={<InfrastructureInventory />} />
        <Route path="/firmware-compliance" element={<FirmwareCompliance />} />
      </Routes>
    </div>
  )
}
