import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const IntegrationsContext = createContext({
  integrations: { iiq: true, google: true, meraki: true },
  loading: true
})

export function IntegrationsProvider({ children }) {
  const [integrations, setIntegrations] = useState({ iiq: true, google: true, meraki: true })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/config/integrations')
      .then(res => setIntegrations(res.data))
      .catch(() => {
        // Default to all enabled if endpoint fails
        setIntegrations({ iiq: true, google: true, meraki: true })
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <IntegrationsContext.Provider value={{ integrations, loading }}>
      {children}
    </IntegrationsContext.Provider>
  )
}

export function useIntegrations() {
  return useContext(IntegrationsContext)
}
