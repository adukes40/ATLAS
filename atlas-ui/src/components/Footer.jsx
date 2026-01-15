import { Github, GitBranch } from 'lucide-react'

export default function Footer({ className = '' }) {
  return (
    <footer className={`mt-12 py-6 border-t border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-200">ATLAS</span>
          <span>&copy; {new Date().getFullYear()} Caesar Rodney School District</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2" title="Project Version">
            <GitBranch className="h-4 w-4" />
            <span className="font-mono">v1.0.0</span>
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