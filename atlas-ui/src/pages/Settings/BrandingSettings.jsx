import { useState, useEffect, useRef } from 'react'
import { Palette, Upload, Save, Trash2, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import axios from 'axios'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

function resizeImage(file, size) {
  return new Promise((resolve) => {
    // SVGs don't need canvas resizing
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.readAsDataURL(file)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')

        // Draw image centered/cover into square
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        const x = (size - w) / 2
        const y = (size - h) / 2
        ctx.drawImage(img, x, y, w, h)

        resolve(canvas.toDataURL('image/png'))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export default function BrandingSettings() {
  const [loginIcon, setLoginIcon] = useState(null)
  const [favicon, setFavicon] = useState(null)
  const [currentLoginIcon, setCurrentLoginIcon] = useState(null)
  const [currentFavicon, setCurrentFavicon] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const fileInputRef = useRef(null)

  // Load current branding on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get('/api/settings')
        setCurrentLoginIcon(res.data?.branding_login_icon || null)
        setCurrentFavicon(res.data?.branding_favicon || null)
      } catch (err) {
        // Ignore - no branding set yet
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setError(null)
    setSuccess(null)

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Please upload a PNG, JPG, or SVG file.')
      return
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum size is 2MB.')
      return
    }

    // Resize to both sizes
    const [icon128, icon32] = await Promise.all([
      resizeImage(file, 128),
      resizeImage(file, 32),
    ])

    setLoginIcon(icon128)
    setFavicon(icon32)
  }

  const handleSave = async () => {
    if (!loginIcon || !favicon) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await axios.post('/api/settings', {
        settings: {
          branding_login_icon: loginIcon,
          branding_favicon: favicon,
        }
      })
      setCurrentLoginIcon(loginIcon)
      setCurrentFavicon(favicon)
      setLoginIcon(null)
      setFavicon(null)
      setSuccess('Branding saved successfully. Refresh the page to see the new favicon.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError('Failed to save branding settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    setError(null)
    setSuccess(null)

    try {
      await axios.post('/api/settings', {
        settings: {
          branding_login_icon: '',
          branding_favicon: '',
        }
      })
      setCurrentLoginIcon(null)
      setCurrentFavicon(null)
      setLoginIcon(null)
      setFavicon(null)
      setSuccess('Branding removed. Defaults will be used.')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError('Failed to remove branding.')
    } finally {
      setRemoving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  const previewLoginIcon = loginIcon || currentLoginIcon
  const previewFavicon = favicon || currentFavicon
  const hasUnsavedChanges = loginIcon && favicon
  const hasSavedBranding = currentLoginIcon && currentFavicon

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
          <Palette className="h-5 w-5 text-pink-600 dark:text-pink-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Branding
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Customize your organization's logo and icons
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Organization Icon Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
        <div>
          <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">
            Organization Icon
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upload a logo or icon for your organization. It will appear on the login page and as the browser tab icon.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Accepts PNG, JPG, or SVG. Maximum 2MB. Image will be automatically resized.
          </p>
        </div>

        {/* Upload Zone */}
        <label className="block relative cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className={`w-full px-4 py-8 rounded-lg border-2 border-dashed transition-colors ${
            hasUnsavedChanges
              ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
              : hasSavedBranding
                ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/10'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
          }`}>
            <div className="flex flex-col items-center justify-center gap-2 text-slate-600 dark:text-slate-400">
              {previewLoginIcon ? (
                <img src={previewLoginIcon} alt="Organization icon" className="h-16 w-16 object-contain" />
              ) : (
                <Upload className="h-8 w-8" />
              )}
              <span className="text-sm">
                {hasUnsavedChanges
                  ? 'New icon selected — save to apply'
                  : hasSavedBranding
                    ? 'Click to upload a new icon'
                    : 'Click to upload your organization icon'}
              </span>
            </div>
          </div>
        </label>

        {/* Preview */}
        {previewLoginIcon && (
          <div className="flex items-center gap-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
            <div className="text-center">
              <img src={previewLoginIcon} alt="Login preview" className="h-12 w-12 object-contain mx-auto mb-2" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Login Page</span>
            </div>
            <div className="text-center">
              <img src={previewFavicon || previewLoginIcon} alt="Favicon preview" className="h-8 w-8 object-contain mx-auto mb-2" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Browser Tab</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>

          {hasSavedBranding && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove Icon
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
