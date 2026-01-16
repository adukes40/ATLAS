import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpCircle } from 'lucide-react'
import axios from 'axios'

/**
 * UpdateBadge - Shows an amber notification when updates are available.
 * Checks for updates on mount and every 30 minutes.
 * Clicking navigates to /settings/system.
 */
export default function UpdateBadge() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [commitCount, setCommitCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const res = await axios.get('/api/system/updates/check')
        setUpdateAvailable(res.data.update_available)
        if (res.data.changelog) {
          setCommitCount(res.data.changelog.length)
        }
      } catch (err) {
        // Silently fail - don't show badge if check fails
        console.error('Failed to check for updates:', err)
      }
    }

    // Check on mount
    checkUpdates()

    // Check every 30 minutes
    const interval = setInterval(checkUpdates, 30 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  if (!updateAvailable) return null

  return (
    <button
      onClick={() => navigate('/settings/system')}
      className="relative p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
      title={`Update available${commitCount > 0 ? ` (${commitCount} new commit${commitCount !== 1 ? 's' : ''})` : ''}`}
    >
      <ArrowUpCircle className="h-5 w-5" />
      {commitCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full px-1">
          {commitCount > 9 ? '9+' : commitCount}
        </span>
      )}
    </button>
  )
}
