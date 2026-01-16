import { useState } from 'react'
import { Network, Calculator, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  calculateSubnet,
  isValidIp,
  ipToInt,
  isIpInSubnet,
  maskToCidr
} from '../../utils/subnetCalc'

// Generate all CIDR options from /1 to /32
const generateCidrOptions = () => {
  const options = []
  for (let cidr = 1; cidr <= 32; cidr++) {
    // Calculate subnet mask
    const maskInt = cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0
    const mask = [
      (maskInt >>> 24) & 255,
      (maskInt >>> 16) & 255,
      (maskInt >>> 8) & 255,
      maskInt & 255
    ].join('.')

    // Calculate usable hosts
    const totalHosts = Math.pow(2, 32 - cidr)
    const usableHosts = cidr >= 31 ? (cidr === 31 ? 2 : 1) : totalHosts - 2

    options.push({
      value: cidr,
      label: `/${cidr} (${mask})`,
      hosts: usableHosts.toLocaleString()
    })
  }
  return options
}

const CIDR_OPTIONS = generateCidrOptions()

export default function SubnetCalculator() {
  const [ipAddress, setIpAddress] = useState('')
  const [cidrOrMask, setCidrOrMask] = useState('24')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // IP-in-subnet checker
  const [testIp, setTestIp] = useState('')
  const [testResult, setTestResult] = useState(null)

  const handleCalculate = () => {
    setError(null)
    setResult(null)
    setTestResult(null)

    // Validate IP
    if (!isValidIp(ipAddress)) {
      setError('Invalid IP address format')
      return
    }

    // Parse CIDR or subnet mask
    let cidr
    if (cidrOrMask.includes('.')) {
      // It's a subnet mask
      cidr = maskToCidr(cidrOrMask)
      if (cidr === null) {
        setError('Invalid subnet mask')
        return
      }
    } else {
      // It's a CIDR number
      cidr = parseInt(cidrOrMask, 10)
      if (isNaN(cidr) || cidr < 0 || cidr > 32) {
        setError('CIDR must be between 0 and 32')
        return
      }
    }

    const calcResult = calculateSubnet(ipAddress, cidr)
    if (calcResult) {
      setResult(calcResult)
    } else {
      setError('Calculation failed')
    }
  }

  const handleTestIp = () => {
    if (!result) return

    if (!isValidIp(testIp)) {
      setTestResult({ valid: false, error: 'Invalid IP address' })
      return
    }

    const testIpInt = ipToInt(testIp)
    const inSubnet = isIpInSubnet(testIpInt, result._networkInt, result._maskInt)

    setTestResult({
      valid: true,
      inSubnet,
      ip: testIp
    })
  }

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter') {
      action()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/utilities"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Utilities
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Subnet Calculator
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Calculate network details from IP and CIDR/subnet mask
            </p>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* IP Address Input */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              IP Address
            </label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleCalculate)}
              placeholder="192.168.1.50"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* CIDR/Mask Input */}
          <div className="w-full sm:w-56">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              CIDR or Subnet Mask
            </label>
            <select
              value={cidrOrMask}
              onChange={(e) => setCidrOrMask(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {CIDR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Or type a subnet mask (e.g., 255.255.255.0)
            </p>
          </div>

          {/* Calculate Button */}
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Calculator className="h-4 w-4" />
              Calculate
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-4">
            Results
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Network Info */}
            <div className="space-y-3">
              <ResultRow label="Network Address" value={result.networkAddress} mono />
              <ResultRow label="Broadcast Address" value={result.broadcastAddress} mono />
              <ResultRow label="Subnet Mask" value={result.subnetMask} mono />
              <ResultRow label="Wildcard Mask" value={result.wildcardMask} mono />
            </div>

            {/* Host Info */}
            <div className="space-y-3">
              <ResultRow
                label="Usable Host Range"
                value={`${result.firstUsableHost} - ${result.lastUsableHost}`}
                mono
              />
              <ResultRow label="Total Hosts" value={result.totalHosts.toLocaleString()} />
              <ResultRow label="Usable Hosts" value={result.usableHosts.toLocaleString()} />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700 my-5" />

          {/* IP Classification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResultRow label="IP Class" value={result.ipClass} />
            <ResultRow label="IP Type" value={result.ipType} highlight={result.ipType.includes('Private')} />
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700 my-5" />

          {/* IP-in-Subnet Checker */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Is IP in this subnet?
            </h4>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={testIp}
                onChange={(e) => setTestIp(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleTestIp)}
                placeholder="Enter IP to check"
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleTestIp}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors"
              >
                Check
              </button>

              {/* Test Result */}
              {testResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  testResult.error
                    ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                    : testResult.inSubnet
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                }`}>
                  {testResult.error ? (
                    <span className="text-sm">{testResult.error}</span>
                  ) : testResult.inSubnet ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Yes, in subnet</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">No, outside subnet</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper component for result rows
function ResultRow({ label, value, mono = false, highlight = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${
        highlight
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-800 dark:text-slate-100'
      } ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
