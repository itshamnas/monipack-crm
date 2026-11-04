import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Users, 
  ShieldCheck, 
  FileText, 
  Database, 
  Download, 
  Plus, 
  Trash2, 
  Save, 
  Check, 
  AlertCircle,
  Building,
  Phone,
  Mail,
  Lock,
  Clock,
  Tag,
  Kanban,
  UserCheck,
  MapPin,
  Edit2,
  KeyRound
} from 'lucide-react';

export default function Settings({ authFetch, showToast, currentUser, onRefreshConfig, products = [] }) {
  const [activeSubTab, setActiveSubTab] = useState('categories'); // 'categories', 'branches', 'stages', 'users', 'company', 'audit'
  const [settings, setSettings] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals & Inputs
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // New Stage State
  const [isAddStageOpen, setIsAddStageOpen] = useState(false);
  const [newStage, setNewStage] = useState({ label: '', color: 'border-t-blue-500 bg-blue-50/30' });

  // New Branch State
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({
    name: '',
    city: '',
    phone: '+968 ',
    salesman: '',
    isHeadquarters: false,
  });

  // Edit Branch State
  const [editingBranch, setEditingBranch] = useState(null);

  // New User State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  });

  // Reset Staff Password State
  const [resetPasswordModal, setResetPasswordModal] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');

  // Load all settings and configuration with resilient Promise.allSettled
  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        authFetch('/api/settings'),
        authFetch('/api/users'),
        authFetch('/api/audit-logs'),
        authFetch('/api/config'),
      ]);

      const [settingsRes, usersRes, logsRes, configRes] = results;

      if (settingsRes.status === 'fulfilled' && settingsRes.value.ok) {
        try {
          setSettings(await settingsRes.value.json());
        } catch (e) {
          console.warn('Error parsing settings:', e);
        }
      }

      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        try {
          setUsersList(await usersRes.value.json());
        } catch (e) {
          console.warn('Error parsing users:', e);
        }
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        try {
          const logs = await logsRes.value.json();
          if (Array.isArray(logs)) setAuditLogs(logs);
        } catch (e) {
          console.warn('Error parsing audit logs:', e);
        }
      }

      if (configRes.status === 'fulfilled' && configRes.value.ok) {
        try {
          const cfg = await configRes.value.json();
          if (Array.isArray(cfg.categories)) setCategories(cfg.categories);
          if (Array.isArray(cfg.pipelineStages)) setPipelineStages(cfg.pipelineStages);
          if (Array.isArray(cfg.branches)) setBranches(cfg.branches);
        } catch (e) {
          console.warn('Error parsing config:', e);
        }
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      showToast('Error loading configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- Category Handlers ---
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      const res = await authFetch('/api/settings/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (res.ok) {
        showToast(`Category "${newCategoryName}" added!`);
        setNewCategoryName('');
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add category', 'error');
      }
    } catch {
      showToast('Failed to add category', 'error');
    }
  };

  const handleDeleteCategory = async (catName) => {
    if (!window.confirm(`Delete product category "${catName}"?`)) return;
    try {
      const res = await authFetch(`/api/settings/categories/${encodeURIComponent(catName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast(`Category "${catName}" removed.`);
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to remove category', 'error');
      }
    } catch {
      showToast('Failed to remove category', 'error');
    }
  };

  // --- Stage Handlers ---
  const handleAddStage = async (e) => {
    e.preventDefault();
    if (!newStage.label.trim()) return;

    try {
      const res = await authFetch('/api/settings/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStage),
      });

      if (res.ok) {
        showToast(`Pipeline stage "${newStage.label}" created!`);
        setIsAddStageOpen(false);
        setNewStage({ label: '', color: 'border-t-blue-500 bg-blue-50/30' });
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create stage', 'error');
      }
    } catch {
      showToast('Failed to create stage', 'error');
    }
  };

  const handleDeleteStage = async (id, label) => {
    if (pipelineStages.length <= 1) {
      alert('You must keep at least one pipeline stage.');
      return;
    }
    if (!window.confirm(`Remove pipeline stage "${label}"?`)) return;
    try {
      const res = await authFetch(`/api/settings/stages/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Pipeline stage "${label}" deleted.`);
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to delete stage', 'error');
      }
    } catch {
      showToast('Failed to delete stage', 'error');
    }
  };

  // --- Branch & Salesman Handlers ---
  const handleAddBranch = async (e) => {
    e.preventDefault();
    if (!newBranch.name.trim()) return;

    try {
      const res = await authFetch('/api/settings/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBranch),
      });

      if (res.ok) {
        showToast(`Branch "${newBranch.name}" created!`);
        setIsAddBranchOpen(false);
        setNewBranch({ name: '', city: '', phone: '+968 ', salesman: '', isHeadquarters: false });
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add branch', 'error');
      }
    } catch {
      showToast('Failed to add branch', 'error');
    }
  };

  const handleUpdateBranch = async (e) => {
    e.preventDefault();
    if (!editingBranch) return;

    try {
      const res = await authFetch(`/api/settings/branches/${editingBranch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingBranch),
      });

      if (res.ok) {
        showToast(`Branch "${editingBranch.name}" updated!`);
        setEditingBranch(null);
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update branch', 'error');
      }
    } catch {
      showToast('Failed to update branch', 'error');
    }
  };

  const handleDeleteBranch = async (id, name) => {
    if (!window.confirm(`Delete branch "${name}"?`)) return;
    try {
      const res = await authFetch(`/api/settings/branches/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Branch "${name}" deleted.`);
        await loadData();
        if (onRefreshConfig) onRefreshConfig();
      }
    } catch {
      showToast('Failed to delete branch', 'error');
    }
  };

  // --- User Account Handlers ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      if (res.ok) {
        showToast(`User account for ${newUser.name} created!`);
        setIsAddUserOpen(false);
        setNewUser({ name: '', email: '', password: '', role: 'admin' });
        loadData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create user', 'error');
      }
    } catch {
      showToast('Failed to create user', 'error');
    }
  };

  const handleDeleteUser = async (id, email) => {
    if (email === 'administrator@monipack.com') {
      alert('The primary Super Administrator account cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;

    try {
      const res = await authFetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`User ${email} deleted.`);
        loadData();
      }
    } catch {
      showToast('Failed to delete user', 'error');
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordModal || !resetPasswordInput) return;
    if (resetPasswordInput.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    try {
      const res = await authFetch(`/api/users/${resetPasswordModal.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPasswordInput }),
      });
      if (res.ok) {
        showToast(`Password updated successfully for ${resetPasswordModal.name}!`);
        setResetPasswordModal(null);
        setResetPasswordInput('');
        loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to update password', 'error');
      }
    } catch {
      showToast('Failed to update password', 'error');
    }
  };

  // --- Company Settings Handlers ---
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        showToast('Company settings updated successfully!');
        loadData();
      }
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  // Download System Backup
  const handleDownloadBackup = async () => {
    try {
      const res = await authFetch('/api/backup');
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `monipack_crm_backup_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('System snapshot downloaded successfully!');
      loadData();
    } catch {
      showToast('Backup download failed', 'error');
    }
  };

  // Safe Purge All Leads
  const handlePurgeLeads = async () => {
    const confirmMessage = prompt('Type RESET to confirm permanently deleting all leads from the database:');
    if (confirmMessage !== 'RESET') {
      if (confirmMessage !== null) {
        showToast('Reset cancelled. Confirmation text did not match.', 'error');
      }
      return;
    }

    try {
      const res = await authFetch('/api/leads/purge-all', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast(`Success: ${data.purgedCount || 0} leads purged. Database is now fresh.`);
        loadData();
      } else {
        showToast(data.error || 'Failed to purge leads', 'error');
      }
    } catch {
      showToast('Error resetting leads database', 'error');
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-bold shrink-0">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Super Admin Settings</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
              👑 Super Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dynamic product categories, branch & salesman assignments, pipeline stages, users, and audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePurgeLeads}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition active:scale-95 cursor-pointer"
            title="Permanently remove all leads to start with clean database"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Leads Data</span>
          </button>

          <button
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download Database Snapshot</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-4 sm:gap-6 text-xs font-bold overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveSubTab('categories')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
            activeSubTab === 'categories'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Product Categories ({categories.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('branches')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap ${
            activeSubTab === 'branches'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Branches & Salesmen ({branches.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('stages')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap ${
            activeSubTab === 'stages'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Kanban className="w-4 h-4" />
          <span>Pipeline Stages ({pipelineStages.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('users')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap ${
            activeSubTab === 'users'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Accounts ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('company')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap ${
            activeSubTab === 'company'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Company Defaults</span>
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`pb-3 flex items-center gap-2 transition border-b-2 -mb-px whitespace-nowrap ${
            activeSubTab === 'audit'
              ? 'border-red-600 text-red-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: PRODUCT CATEGORIES */}
      {activeSubTab === 'categories' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Add New Product Category
              </h3>
              <p className="text-[11px] text-slate-500">
                Categories are available dynamically across lead forms, filters, and product catalogs.
              </p>
            </div>

            <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                required
                placeholder="e.g. Eco-Friendly Straws & Cutlery"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-3 py-2 w-full sm:w-64 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Category</span>
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold w-12 text-center">#</th>
                  <th className="py-3 px-4 font-bold">Category Title</th>
                  <th className="py-3 px-4 font-bold text-center">Catalog Usage</th>
                  <th className="py-3 px-4 font-bold text-center">Status</th>
                  <th className="py-3 px-4 font-bold text-center w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {categories.length > 0 ? (
                  categories.map((cat, idx) => {
                    const count = (products || []).filter((p) => p.category === cat).length;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{cat}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {count} product{count === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active in Dropdowns
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title={`Delete Category "${cat}"`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="py-10 text-center text-slate-400 text-xs">
                      No categories configured. Use the form above to add your first product category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BRANCHES & ASSIGNED SALESMEN */}
      {activeSubTab === 'branches' && (
        <div className="space-y-5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Oman Regional Branches & Sales Reps
              </h3>
              <p className="text-[11px] text-slate-500">
                Configure regional distribution centers and the designated sales representative.
              </p>
            </div>

            <button
              onClick={() => setIsAddBranchOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Branch / Salesman</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-red-600" />
                        {b.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{b.city || 'Oman'}</p>
                    </div>
                    {b.isHeadquarters && (
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                        HQ
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Assigned Salesman:</span>
                      <span className="font-bold text-slate-900 flex items-center gap-1">
                        <UserCheck className="w-3 h-3 text-red-600" />
                        {b.salesman || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-slate-400 font-sans">Contact:</span>
                      <span className="text-slate-700">{b.phone || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setEditingBranch(b)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition"
                    title="Edit Salesman / Branch"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!b.isHeadquarters && (
                    <button
                      onClick={() => handleDeleteBranch(b.id, b.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                      title="Delete Branch"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PIPELINE STAGES */}
      {activeSubTab === 'stages' && (
        <div className="space-y-5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Sales Pipeline Stages
              </h3>
              <p className="text-[11px] text-slate-500">
                Kanban columns and deal conversion workflow used across the CRM.
              </p>
            </div>

            <button
              onClick={() => setIsAddStageOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Pipeline Stage</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {pipelineStages.map((stg, idx) => (
              <div
                key={stg.id}
                className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-600"></span>
                    <h4 className="text-xs font-bold text-slate-900">{stg.label}</h4>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">ID: {stg.id}</p>
                </div>

                {pipelineStages.length > 1 && (
                  <button
                    onClick={() => handleDeleteStage(stg.id, stg.label)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                    title="Delete Stage"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: USER ACCOUNTS & PERMISSIONS */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Authorized CRM Staff Accounts
                </h3>
                <p className="text-[11px] text-slate-500">
                  Control who has full export permissions vs operational-only access.
                </p>
              </div>

              <button
                onClick={() => setIsAddUserOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Staff User</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-bold">User Name</th>
                    <th className="py-3 px-4 font-bold">Email</th>
                    <th className="py-3 px-4 font-bold">Role</th>
                    <th className="py-3 px-4 font-bold">Export Capability</th>
                    <th className="py-3 px-4 font-bold">Created Date</th>
                    <th className="py-3 px-4 font-bold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        {u.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                      <td className="py-3 px-4">
                        {u.role === 'super_admin' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            👑 Administrator (Full Control)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            🛡️ Admin (Manager)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {u.canExport ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            CSV Export Allowed
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            <Lock className="w-3 h-3 text-slate-400" />
                            Export Restricted
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordModal(u);
                              setResetPasswordInput('');
                            }}
                            className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Reset Staff Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {u.email !== 'administrator@monipack.com' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="p-1.5 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition"
                              title="Delete User"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: COMPANY DEFAULTS */}
      {activeSubTab === 'company' && settings && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-sm font-bold text-slate-900">Commercial & Legal Information</h3>
            <p className="text-xs text-slate-500">
              Information populated into official quotations and print documents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Legal Name</label>
              <input
                type="text"
                value={settings.companyName || ''}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Arabic Name</label>
              <input
                type="text"
                value={settings.companyNameAr || ''}
                onChange={(e) => setSettings({ ...settings, companyNameAr: e.target.value })}
                className="w-full text-xs font-cairo bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">General Inquiries Tel</label>
              <input
                type="text"
                value={settings.phone || ''}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hotline / Complaints</label>
              <input
                type="text"
                value={settings.complaintPhone || ''}
                onChange={(e) => setSettings({ ...settings, complaintPhone: e.target.value })}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Support Email</label>
              <input
                type="email"
                value={settings.supportEmail || ''}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Default Quotation Terms & Conditions</h4>
                <p className="text-xs text-slate-500">
                  These terms automatically pre-populate onto all new quotations and print documents.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const current = settings.defaultTerms || [];
                  setSettings({ ...settings, defaultTerms: [...current, ''] });
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold border border-red-200 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Term</span>
              </button>
            </div>

            <div className="space-y-2">
              {(settings.defaultTerms || []).map((term, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5 text-right">{index + 1}.</span>
                  <input
                    type="text"
                    value={term}
                    placeholder="Enter commercial condition or legal note..."
                    onChange={(e) => {
                      const updated = [...(settings.defaultTerms || [])];
                      updated[index] = e.target.value;
                      setSettings({ ...settings, defaultTerms: updated });
                    }}
                    className="flex-1 text-xs bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:bg-white focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (settings.defaultTerms || []).filter((_, i) => i !== index);
                      setSettings({ ...settings, defaultTerms: updated });
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 transition"
                    title="Remove Term"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(!settings.defaultTerms || settings.defaultTerms.length === 0) && (
                <p className="text-xs text-slate-400 italic">No default terms configured. Click "Add Term" above.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Save Company Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: SECURITY AUDIT TRAIL */}
      {activeSubTab === 'audit' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/60">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Security Audit Trail
            </h3>
            <p className="text-[11px] text-slate-500">
              Live tracking of system logins, exports of confidential records, and setting updates.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {auditLogs.length > 0 ? (
              auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 flex items-start justify-between text-xs hover:bg-slate-50/50">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${
                        log.type === 'security'
                          ? 'bg-red-600 ring-4 ring-red-100'
                          : log.type === 'login'
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`}
                    ></div>
                    <div>
                      <p className="font-semibold text-slate-900 leading-snug">
                        {log.leadName ? <span className="font-bold text-red-700">{log.leadName}: </span> : null}
                        {log.description}
                      </p>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                        Event: {log.type}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No audit events recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD BRANCH */}
      {isAddBranchOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Oman Branch & Salesman</h3>
              <button onClick={() => setIsAddBranchOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddBranch} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Salalah Hub / Seeb"
                  value={newBranch.name}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Salesman / Representative *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Shamnas Acheerakath / Ahmed Al Balushi"
                  value={newBranch.salesman}
                  onChange={(e) => setNewBranch({ ...newBranch, salesman: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City / Region</label>
                  <input
                    type="text"
                    placeholder="e.g. Dhofar / Muscat"
                    value={newBranch.city}
                    onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddBranchOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                >
                  Save Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT BRANCH */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Edit Branch & Salesman</h3>
              <button onClick={() => setEditingBranch(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleUpdateBranch} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name</label>
                <input
                  type="text"
                  required
                  value={editingBranch.name}
                  onChange={(e) => setEditingBranch({ ...editingBranch, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Salesman / Representative *</label>
                <input
                  type="text"
                  required
                  value={editingBranch.salesman || ''}
                  onChange={(e) => setEditingBranch({ ...editingBranch, salesman: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City / Region</label>
                  <input
                    type="text"
                    value={editingBranch.city || ''}
                    onChange={(e) => setEditingBranch({ ...editingBranch, city: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editingBranch.phone || ''}
                    onChange={(e) => setEditingBranch({ ...editingBranch, phone: e.target.value })}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBranch(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                >
                  Update Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAGE */}
      {isAddStageOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Pipeline Stage</h3>
              <button onClick={() => setIsAddStageOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddStage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Stage Label *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Contract Review / Sample Testing"
                  value={newStage.label}
                  onChange={(e) => setNewStage({ ...newStage, label: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Color Theme</label>
                <select
                  value={newStage.color}
                  onChange={(e) => setNewStage({ ...newStage, color: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                >
                  <option value="border-t-blue-500 bg-blue-50/30">Blue Accent</option>
                  <option value="border-t-purple-500 bg-purple-50/30">Purple Accent</option>
                  <option value="border-t-amber-500 bg-amber-50/30">Amber Accent</option>
                  <option value="border-t-emerald-500 bg-emerald-50/30">Emerald Accent</option>
                  <option value="border-t-rose-500 bg-rose-50/30">Rose Accent</option>
                  <option value="border-t-slate-500 bg-slate-50/30">Slate Accent</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStageOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                >
                  Create Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Add Staff Account</h3>
              <button onClick={() => setIsAddUserOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Salim Al Hadhrami"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Email</label>
                <input
                  type="email"
                  required
                  placeholder="salim@monipack.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Security Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5"
                >
                  <option value="admin">Admin (Full Control - Export Restricted)</option>
                  <option value="super_admin">Administrator (Full Control + Export)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">Reset Staff Password</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetPasswordModal(null);
                  setResetPasswordInput('');
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="p-6 space-y-4">
              <div>
                <p className="text-xs text-slate-600 mb-3">
                  Set a new password for <span className="font-bold text-slate-900">{resetPasswordModal.name}</span> (<span className="font-mono text-slate-700">{resetPasswordModal.email}</span>).
                </p>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Password (min. 6 characters)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Enter new secure password"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordModal(null);
                    setResetPasswordInput('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
