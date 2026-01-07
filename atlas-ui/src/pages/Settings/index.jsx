import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Settings, Database, Cloud, Wifi, Users, Key, Monitor } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import IIQSettings from './IIQSettings'
import GoogleSettings from './GoogleSettings'
import MerakiSettings from './MerakiSettings'
import OAuthSettings from './OAuthSettings'
import UsersSettings from './UsersSettings'
import DisplaySettings from './DisplaySettings'

const settingsNav = [
  { to: '/settings/display', icon: Monitor, label: 'Display' },
  { to: '/settings/iiq', icon: Database, label: 'Incident IQ' },
  { to: '/settings/google', icon: Cloud, label: 'Google Admin' },
  { to: '/settings/meraki', icon: Wifi, label: 'Meraki' },
  { to: '/settings/oauth', icon: Key, label: 'OAuth / SSO' },
  { to: '/settings/users', icon: Users, label: 'Local Users' },
]

export default function SettingsIndex() {
  const { user } = useAuth()

  // Only admins can access settings
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Settings className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
            Admin Access Required
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Settings are only accessible to administrators.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Settings Sidebar */}
      <div className="w-56 flex-shrink-0">
        <div className="sticky top-20">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Settings
            </h2>
          </div>
          <nav className="space-y-1">
            {settingsNav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 min-w-0">
        <Routes>
          <Route index element={<Navigate to="display" replace />} />
          <Route path="display" element={<DisplaySettings />} />
          <Route path="iiq" element={<IIQSettings />} />
          <Route path="google" element={<GoogleSettings />} />
          <Route path="meraki" element={<MerakiSettings />} />
          <Route path="oauth" element={<OAuthSettings />} />
          <Route path="users" element={<UsersSettings />} />
        </Routes>
      </div>
    </div>
  )
}
