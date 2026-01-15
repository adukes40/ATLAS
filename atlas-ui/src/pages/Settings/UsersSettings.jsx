import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Users, Plus, Loader2, CheckCircle, AlertCircle, Trash2,
  Shield, Eye, Key, MoreVertical, X
} from 'lucide-react'

export default function UsersSettings() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(null) // user object
  const [actionLoading, setActionLoading] = useState(false)

  // Create user form
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    role: 'readonly',
  })

  // Reset password form
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  // Get display settings from localStorage
  const getDisplaySettings = () => ({
    timezone: localStorage.getItem('atlas_timezone') || 'America/New_York',
    hour12: localStorage.getItem('atlas_time_format') !== '24'
  })

  // Fetch users
  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/settings/users')
      setUsers(res.data.users || [])
    } catch (err) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Create user
  const handleCreateUser = async () => {
    if (newUser.password !== newUser.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newUser.password.length < 12) {
      setError('Password must be at least 12 characters')
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      await axios.post('/api/settings/users', {
        username: newUser.username,
        password: newUser.password,
        role: newUser.role,
        email: newUser.email || null,
      })
      setSuccess('User created successfully')
      setShowCreateModal(false)
      setNewUser({
        username: '',
        password: '',
        confirmPassword: '',
        email: '',
        role: 'readonly',
      })
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally {
      setActionLoading(false)
    }
  }

  // Update user role
  const handleUpdateRole = async (userId, newRole) => {
    try {
      await axios.put(`/api/settings/users/${userId}`, { role: newRole })
      setSuccess('User role updated')
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update role')
    }
  }

  // Toggle user active status
  const handleToggleActive = async (userId, currentActive) => {
    try {
      await axios.put(`/api/settings/users/${userId}`, { is_active: !currentActive })
      setSuccess(currentActive ? 'User deactivated' : 'User activated')
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update user')
    }
  }

  // Reset password
  const handleResetPassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters')
      return
    }

    setActionLoading(true)
    setError(null)

    try {
      await axios.post(`/api/settings/users/${showResetModal.id}/reset-password`, {
        new_password: newPassword,
      })
      setSuccess('Password reset successfully')
      setShowResetModal(null)
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-indigo-500" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              Local Users
            </h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage local user accounts for ATLAS access.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {users.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            No users yet. Click "Add User" to create one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">User</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Role</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Last Login</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-3 px-4">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {user.username}
                      </div>
                      {user.email && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {user.email}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={user.role}
                      onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                    >
                      <option value="admin">Admin</option>
                      <option value="readonly">Read-Only</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      className={`text-xs px-2 py-1 rounded-full ${
                        user.is_active
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                    {user.must_change_password && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        (must change password)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                    {user.last_login
                      ? (() => {
                          const { timezone, hour12 } = getDisplaySettings()
                          // Ensure timestamp is treated as UTC
                          const dateStr = user.last_login.endsWith('Z') ? user.last_login : user.last_login + 'Z'
                          return new Date(dateStr).toLocaleString('en-US', {
                            timeZone: timezone,
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: hour12
                          })
                        })()
                      : 'Never'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setShowResetModal(user)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium"
                    >
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Create User
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password (min 12 characters)
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={newUser.confirmPassword}
                  onChange={(e) => setNewUser(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="readonly">Read-Only</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={actionLoading || !newUser.username || !newUser.password}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Reset Password
              </h3>
              <button
                onClick={() => setShowResetModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Reset password for <strong>{showResetModal.username}</strong>. User will be required to change password on next login.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  New Password (min 12 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowResetModal(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={actionLoading || !newPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
