import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Sun, Moon, LogOut } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { IntegrationsProvider } from './context/IntegrationsContext'
import Sidebar from './components/Sidebar'
import NotificationBell from './components/NotificationBell'
import Device360 from './pages/Device360'
import DashboardsIndex from './pages/Dashboards/index'
import GoogleDashboard from './pages/Dashboards/GoogleDashboard'
import IIQDashboard from './pages/Dashboards/IIQDashboard'
import MerakiDashboard from './pages/Dashboards/MerakiDashboard'
import ReportsIndex from './pages/Reports/index'
import UtilitiesIndex from './pages/Utilities/index'
import SettingsIndex from './pages/Settings/index'
import Login from './pages/Login'
import PasswordChangeModal from './components/PasswordChangeModal'
import Footer from './components/Footer'

// Layout component that handles responsive width based on route
function AppLayout() {
  const location = useLocation()
  const { user, logout, isAuthenticated, loading } = useAuth()

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />
  }

  // Check if current route is a report page (not the index)
  const isReportPage = location.pathname.startsWith('/reports/') && location.pathname !== '/reports/'

  // Dynamic width classes - full width for reports, constrained for other pages
  const contentWidthClass = isReportPage
    ? 'w-full px-4 md:px-6 lg:px-8'
    : 'max-w-6xl mx-auto px-4 md:px-8'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area - offset by sidebar width */}
      <div className="pl-14 transition-all duration-300">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
          <div className={`${contentWidthClass} h-14 flex items-center justify-between`}>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                ATLAS <span className="text-slate-400 dark:text-slate-500 font-light">Command Center</span>
              </h1>
            </div>

            <div className="flex items-center gap-2 md:gap-4">
              {/* Theme Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all active:scale-95"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Notification Bell */}
              <NotificationBell />

              {/* User Info */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm">
                {user?.picture && (
                  <img
                    src={user.picture}
                    alt=""
                    className="h-5 w-5 rounded-full"
                  />
                )}
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 max-w-[120px] truncate">
                  {user?.name || user?.email}
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-95"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>

              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Online</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={`${contentWidthClass} py-6 md:py-8`}>
          <Routes>
            <Route path="/" element={<Device360 />} />
            <Route path="/dashboards" element={<DashboardsIndex />} />
            <Route path="/dashboards/google" element={<GoogleDashboard />} />
            <Route path="/dashboards/iiq" element={<IIQDashboard />} />
            <Route path="/dashboards/meraki" element={<MerakiDashboard />} />
            <Route path="/reports/*" element={<ReportsIndex />} />
            <Route path="/utilities/*" element={<UtilitiesIndex />} />
            <Route path="/settings/*" element={<SettingsIndex />} />
          </Routes>

          {/* Password Change Modal - shown when must_change_password is true */}
          <PasswordChangeModal />
        </main>

        {/* Footer */}
        <Footer 
          className={contentWidthClass} 
          districtName={districtSettings.name}
          supportEmail={districtSettings.email}
        />
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <IntegrationsProvider>
          <AppLayout />
        </IntegrationsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
