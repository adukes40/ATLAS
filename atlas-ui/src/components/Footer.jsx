import { useState, useEffect } from 'react'
import { Github, GitBranch, Mail } from 'lucide-react'
import axios from 'axios'

export default function Footer({ className = '', districtName, supportEmail }) {
  const [version, setVersion] = useState({ version: '...', commit: '' })

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await axios.get('/api/system/version')
        setVersion(res.data)
      } catch (err) {
        setVersion({ version: '?.?.?', commit: '' })
      }
    }
    fetchVersion()
  }, [])

  return (
    <footer className={`mt-12 py-6 border-t border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">ATLAS</span>
            <span>&copy; {new Date().getFullYear()} {districtName || 'Caesar Rodney School District'}</span>
          </div>
          {supportEmail && (
            <a href={`mailto:${supportEmail}`} className="flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
              <Mail className="h-3.5 w-3.5" />
              <span>Contact Support</span>
            </a>
          )}
        </div>
        
        <div className="flex flex-col items-center text-center">
          <span className="font-medium text-slate-600 dark:text-slate-300">Asset, Telemetry, Location, & Analytics System</span>
          <span className="text-xs text-slate-400">A unified IT operations platform for K-12 school districts</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2" title={version.commit ? `Commit: ${version.commit}` : 'Project Version'}>
            <GitBranch className="h-4 w-4" />
            <span className="font-mono">v{version.version}</span>
          </div>
          
          <a 
            href="https://github.com/adukes40/ATLAS" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <Github className="h-4 w-4" />
            <span>adukes40/ATLAS</span>
          </a>
        </div>
      </div>
    </footer>
  )
}