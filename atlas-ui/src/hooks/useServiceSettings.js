/**
 * useServiceSettings - Shared hook for service settings pages.
 * Handles fetching, saving, and testing service configurations.
 */
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

/**
 * Custom hook for service settings management.
 *
 * @param {string} service - Service name for API endpoint (e.g., 'iiq', 'google', 'meraki')
 * @param {Object} options - Configuration options
 * @param {Object} options.fields - Field definitions with keys and default values
 * @param {string[]} options.secretFields - Fields that should be treated as secrets (cleared after save)
 * @param {Function} options.mapResponse - Function to map API response to settings state
 *
 * @returns {Object} Settings state and handlers
 */
export default function useServiceSettings(service, options = {}) {
  const {
    fields = {},
    secretFields = [],
    mapResponse = (data) => data
  } = options

  // Initialize settings with field defaults
  const initialSettings = Object.entries(fields).reduce((acc, [key, defaultValue]) => {
    acc[key] = defaultValue
    return acc
  }, {})

  // State
  const [settings, setSettings] = useState(initialSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [hasSecrets, setHasSecrets] = useState({})
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Fetch current settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get('/api/settings')
        const data = res.data.settings || {}

        // Map response to settings state
        const mappedSettings = mapResponse(data)
        setSettings(prev => ({
          ...prev,
          ...mappedSettings
        }))

        // Check which secret fields are configured
        const secrets = {}
        secretFields.forEach(key => {
          secrets[key] = data[key]?.configured || false
        })
        setHasSecrets(secrets)
      } catch (err) {
        setError('Failed to load settings')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [service])

  // Handle input change
  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    setSettings(prev => ({ ...prev, [name]: value }))
    setSuccess(null)
    setTestResult(null)
  }, [])

  // Set a specific field value
  const setField = useCallback((name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }))
    setSuccess(null)
    setTestResult(null)
  }, [])

  // Save settings
  const handleSave = useCallback(async (keysToSave = null) => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Determine which keys to save
      const keys = keysToSave || Object.keys(fields)

      // Only send non-empty values
      const toSave = {}
      keys.forEach(key => {
        if (settings[key]) {
          toSave[key] = settings[key]
        }
      })

      await axios.post('/api/settings', { settings: toSave })
      setSuccess('Settings saved successfully')

      // Update secret field status and clear values
      const newSecrets = { ...hasSecrets }
      secretFields.forEach(key => {
        if (toSave[key]) {
          newSecrets[key] = true
          setSettings(prev => ({ ...prev, [key]: '' }))
        }
      })
      setHasSecrets(newSecrets)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [settings, fields, secretFields, hasSecrets])

  // Test connection
  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const res = await axios.post(`/api/settings/test/${service}`)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.detail || 'Test failed'
      })
    } finally {
      setTesting(false)
    }
  }, [service])

  // Clear messages
  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
    setTestResult(null)
  }, [])

  return {
    // State
    settings,
    loading,
    saving,
    testing,
    testResult,
    hasSecrets,
    error,
    success,

    // Setters
    setSettings,
    setField,

    // Handlers
    handleChange,
    handleSave,
    handleTest,
    clearMessages
  }
}
