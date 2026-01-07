import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Laptop, LayoutDashboard, FileText, Wrench, Settings, Menu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', icon: Laptop, label: 'Device 360' },
  { to: '/dashboards', icon: LayoutDashboard, label: 'Dashboards' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/utilities', icon: Wrench, label: 'Utilities' },
]

const adminItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-50 transition-all duration-300 ease-in-out ${
        expanded ? 'w-52' : 'w-14'
      }`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo/Menu Section */}
      <div className="h-14 flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
        <Menu className="h-5 w-5 text-slate-400 flex-shrink-0" />
        <span
          className={`ml-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          ATLAS
        </span>
      </div>

      {/* Navigation Items */}
      <nav className="mt-4 px-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`
            }
          >
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span
              className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
                expanded ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {label}
            </span>
          </NavLink>
        ))}

        {/* Admin-only items */}
        {isAdmin && (
          <>
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800" />
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`
                }
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span
                  className={`ml-3 text-sm font-medium whitespace-nowrap transition-opacity duration-200 ${
                    expanded ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {label}
                </span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Version indicator at bottom */}
      <div className="absolute bottom-4 left-0 right-0 px-4">
        <div
          className={`text-[10px] text-slate-400 dark:text-slate-600 transition-opacity duration-200 ${
            expanded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          v1.0.0
        </div>
      </div>
    </aside>
  )
}
