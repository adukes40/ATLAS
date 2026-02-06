# Branding Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Settings > Branding page where admins upload a single icon that becomes both the login page logo and browser tab favicon.

**Architecture:** Single image upload with client-side canvas resizing to 128px (login) and 32px (favicon). Stored as base64 data URIs in the existing `app_settings` key-value table. Served to unauthenticated users via the `/auth/me` endpoint (already works pre-auth). No hardcoded org-specific values.

**Tech Stack:** React 18, Vite, Tailwind CSS, Lucide icons, FastAPI, SQLAlchemy, PostgreSQL

---

### Task 1: Backend — Expose branding in `/auth/me` endpoint

**Files:**
- Modify: `/opt/atlas/atlas-backend/app/routers/auth.py` (around line 277-292)

**Step 1: Add branding fields to the unauthenticated `/auth/me` response**

In the `get_me` function, fetch `branding_login_icon` and `branding_favicon` from the database and include them in both the authenticated and unauthenticated response branches.

```python
# At the top of get_me(), after getting oauth_settings:
db = SessionLocal()
try:
    branding_login_icon = get_setting(db, "branding_login_icon")
    branding_favicon = get_setting(db, "branding_favicon")
finally:
    db.close()
```

Add to the unauthenticated return (the `if not user:` branch):
```python
return {
    "authenticated": False,
    "user": None,
    "oauth_enabled": oauth_settings.get("enabled", False),
    "allowed_domain": oauth_settings.get("allowed_domain"),
    "branding_login_icon": branding_login_icon or None,
    "branding_favicon": branding_favicon or None,
}
```

Add the same two keys to the authenticated return block as well.

**Step 2: Verify the import**

`get_setting` and `SessionLocal` should already be imported in this file. Confirm they are. If not, add:
```python
from app.database import SessionLocal
from app.services.settings_service import get_setting
```

**Step 3: Restart backend and verify**

Run: `sudo systemctl restart atlas.service`
Then: `curl -s http://localhost:8000/auth/me | python3 -m json.tool`
Expected: Response includes `branding_login_icon: null` and `branding_favicon: null`

---

### Task 2: Frontend — Create BrandingSettings page

**Files:**
- Create: `/opt/atlas/atlas-ui/src/pages/Settings/BrandingSettings.jsx`

**Step 1: Create the full BrandingSettings component**

This page has:
- A header matching other settings pages (Palette icon, title, description)
- An "Organization Icon" card with:
  - Dashed-border upload zone (accepts PNG, JPG, SVG, max 2MB)
  - Client-side canvas resize to 128px and 32px on file select
  - Live preview showing both sizes side-by-side
  - Save button that POSTs both base64 data URIs to `/api/settings`
  - Remove button that clears both keys
- Loading, error, and success states

```jsx
import { useState, useEffect, useRef } from 'react'
import { Palette, Upload, Save, Trash2, Loader2, CheckCircle, AlertCircle, ImageIcon } from 'lucide-react'
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
  const [loginIcon, setLoginIcon] = useState(null)    // base64 data URI (128px)
  const [favicon, setFavicon] = useState(null)         // base64 data URI (32px)
  const [currentLoginIcon, setCurrentLoginIcon] = useState(null) // saved in DB
  const [currentFavicon, setCurrentFavicon] = useState(null)     // saved in DB
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
      // Reset file input
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

  // Determine what to show in preview
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
```

---

### Task 3: Frontend — Add Branding to Settings navigation

**Files:**
- Modify: `/opt/atlas/atlas-ui/src/pages/Settings/index.jsx`

**Step 1: Add import for BrandingSettings and Palette icon**

At the top of the file, add:
```jsx
import BrandingSettings from './BrandingSettings'
```

Update the icon import to include `Palette`:
```jsx
import { Settings, Database, Cloud, Wifi, Users, Key, Monitor, Building, Server, Palette } from 'lucide-react'
```

**Step 2: Add nav item after Display**

In the `settingsNav` array, insert after the Display entry:
```jsx
{ to: '/settings/branding', icon: Palette, label: 'Branding' },
```

So the array starts:
```jsx
const settingsNav = [
  { to: '/settings/display', icon: Monitor, label: 'Display' },
  { to: '/settings/branding', icon: Palette, label: 'Branding' },
  { to: '/settings/district', icon: Building, label: 'District Info' },
  // ... rest unchanged
]
```

**Step 3: Add route**

Inside the `<Routes>` block, add after the display route:
```jsx
<Route path="branding" element={<BrandingSettings />} />
```

---

### Task 4: Frontend — Login page uses custom icon

**Files:**
- Modify: `/opt/atlas/atlas-ui/src/pages/Login.jsx`

**Step 1: Pass branding through AuthContext**

Modify `/opt/atlas/atlas-ui/src/context/AuthContext.jsx`:

In the state declarations, add:
```jsx
const [brandingLoginIcon, setBrandingLoginIcon] = useState(null)
const [brandingFavicon, setBrandingFavicon] = useState(null)
```

In `checkAuth`, after setting `oauthEnabled`, add:
```jsx
setBrandingLoginIcon(data.branding_login_icon || null)
setBrandingFavicon(data.branding_favicon || null)
```

In the `value` object, add:
```jsx
brandingLoginIcon,
brandingFavicon,
```

**Step 2: Update Login.jsx to use custom icon**

In Login.jsx, destructure the new value:
```jsx
const { localLogin, googleLogin, error, clearError, loading, oauthEnabled, brandingLoginIcon } = useAuth()
```

Replace the Shield icon section (the `<div className="text-center mb-6">` block):
```jsx
<div className="text-center mb-6">
  {brandingLoginIcon ? (
    <img src={brandingLoginIcon} alt="Logo" className="h-12 w-12 mx-auto mb-4 object-contain" />
  ) : (
    <Shield className="h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
  )}
  <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-2">
    Sign in to continue
  </h2>
</div>
```

---

### Task 5: Frontend — Dynamic favicon on app load

**Files:**
- Modify: `/opt/atlas/atlas-ui/src/App.jsx`

**Step 1: Set favicon dynamically in AppLayout**

In the `AppLayout` component, inside the existing `useEffect` that fetches `/api/settings/public`, add favicon logic. Or better, add a separate effect that uses the AuthContext branding data.

After the existing `districtSettings` useEffect, add:
```jsx
// Dynamic favicon from branding
useEffect(() => {
  const setFavicon = async () => {
    try {
      const res = await axios.get('/auth/me')
      if (res.data?.branding_favicon) {
        const link = document.querySelector("link[rel~='icon']")
        if (link) {
          link.href = res.data.branding_favicon
        }
      }
    } catch (err) {
      // Ignore - use default favicon
    }
  }
  setFavicon()
}, [])
```

Note: This runs once on mount. It fetches from `/auth/me` which works without auth and includes the branding data (from Task 1).

---

### Task 6: Build and verify

**Step 1: Rebuild frontend**

Run: `cd /opt/atlas/atlas-ui && npm run build`
Expected: Build succeeds with no errors.

**Step 2: Restart backend**

Run: `sudo systemctl restart atlas.service`
Expected: Service starts successfully.

**Step 3: Manual verification checklist**

- [ ] Settings sidebar shows "Branding" with Palette icon after Display
- [ ] Branding page loads with upload zone
- [ ] Uploading a PNG shows preview at both sizes
- [ ] Saving stores the icon (refresh page, icon still shown)
- [ ] Login page shows custom icon instead of Shield
- [ ] Browser tab shows custom favicon
- [ ] Remove button clears icon, login page reverts to Shield
- [ ] Files over 2MB show error
- [ ] Non-image files are rejected

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Settings > Branding page for custom login icon and favicon"
```
