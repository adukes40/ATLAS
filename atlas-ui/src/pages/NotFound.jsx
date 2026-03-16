import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="h-16 w-16 text-amber-400 mb-4" />
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Page Not Found
      </h2>
      <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Back to Device 360
      </Link>
    </div>
  )
}
