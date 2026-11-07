import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from './components/layout/AppLayout.jsx';
import Sidebar from './components/Sidebar.jsx';
import Navbar from './components/Navbar.jsx';
import LeadModal from './components/LeadModal.jsx';
import WhatsAppModal from './components/WhatsAppModal.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import Quotations from './pages/Quotations.jsx';
import Products from './pages/Products.jsx';
import Branches from './pages/Branches.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import CustomerCare from './pages/CustomerCare.jsx';
import DataCleanup from './pages/DataCleanup.jsx';
import Customers, { SalesmanLinksPage, CustomerFieldsPage } from './pages/Customers.jsx';
import Home from './pages/Home.jsx';
import SectionTabs from './components/layout/SectionTabs.jsx';
import { sectionOf } from './components/layout/navigation.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import MobileBottomNav from './components/layout/MobileBottomNav.jsx';
import OfflineBanner from './components/pwa/OfflineBanner.jsx';
import { getApiUrl } from './api/config.js';

export default function App() {
  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('monipack_auth_token') || '');
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('monipack_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [customerFilter, setCustomerFilter] = useState(null); // filter passed from Home to the Customers page
  useEffect(() => { if (activeTab !== 'customers') setCustomerFilter(null); }, [activeTab]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedBranch, setSelectedBranch] = useState('all');

  // Core Data States
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [products, setProducts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);

  // Modals & Context States
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [whatsAppLead, setWhatsAppLead] = useState(null);
  const [prefilledLeadForQuote, setPrefilledLeadForQuote] = useState(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Permission check for showing/hiding actions (the server enforces the same rules)
  const can = (permission) => Boolean(currentUser?.permissions?.includes(permission));

  const saveSession = (newToken, newUser) => {
    setToken(newToken);
    setCurrentUser(newUser);
    localStorage.setItem('monipack_auth_token', newToken);
    localStorage.setItem('monipack_auth_user', JSON.stringify(newUser));
  };

  const handleLoginSuccess = (newToken, newUser) => {
    saveSession(newToken, newUser);
    if (!newUser?.mustChangePassword) {
      showToast(`Welcome back, ${newUser.name}!`);
    }
  };

  const handlePasswordChanged = (newToken, newUser) => {
    saveSession(newToken, newUser);
    showToast('Password saved. Welcome!');
  };

  const handleLogout = (showToastNotice = true) => {
    setToken('');
    setCurrentUser(null);
    localStorage.removeItem('monipack_auth_token');
    localStorage.removeItem('monipack_auth_user');
    if (showToastNotice) {
      showToast('Signed out successfully.');
    }
  };

  // Authenticated Fetch Helper
  const authFetch = useCallback(
    async (url, options = {}) => {
      const fullUrl = getApiUrl(url);
      const headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };

      const res = await fetch(fullUrl, { ...options, headers });
      if (res.status === 401) {
        handleLogout(false);
        throw new Error('Session expired. Please log in.');
      }
      if (res.status === 403) {
        const body = await res.clone().json().catch(() => ({}));
        if (body.code === 'PASSWORD_CHANGE_REQUIRED') {
          setCurrentUser((u) => (u ? { ...u, mustChangePassword: true } : u));
          throw new Error('Please set a new password first.');
        }
      }
      return res;
    },
    [token]
  );

  // Fetch all CRM data
  const fetchData = useCallback(async () => {
    if (!token || currentUser?.mustChangePassword) return;
    setLoading(true);
    try {
      const [statsRes, leadsRes, prodsRes, quotesRes, branchesRes, configRes] = await Promise.all([
        authFetch('/api/analytics'),
        authFetch('/api/leads'),
        authFetch('/api/products'),
        authFetch('/api/quotations'),
        authFetch('/api/branches'),
        authFetch('/api/config'),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (prodsRes.ok) setProducts(await prodsRes.json());
      if (quotesRes.ok) setQuotations(await quotesRes.json());
      if (branchesRes.ok) setBranches(await branchesRes.json());
      if (configRes && configRes.ok) {
        const cfg = await configRes.json();
        if (cfg.categories) setCategories(cfg.categories);
        if (cfg.pipelineStages) setPipelineStages(cfg.pipelineStages);
      }
    } catch (err) {
      console.error('Error loading Monipack CRM data:', err);
      if (err.message.includes('Session expired')) {
        showToast('Your session has expired. Please log in again.', 'error');
      } else {
        showToast('Error syncing with server.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [token, authFetch, currentUser?.mustChangePassword]);

  // Refresh the signed-in user's role and permissions from the server (older saved sessions have none)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(getApiUrl('/api/auth/me'), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          handleLogout(false);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setCurrentUser(data.user);
            localStorage.setItem('monipack_auth_user', JSON.stringify(data.user));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, fetchData]);

  // Security guard: only users allowed to manage settings can open the Settings page.
  // (Must stay above the early returns below - React hooks cannot run conditionally.)
  useEffect(() => {
    if (activeTab === 'settings' && currentUser && !currentUser.permissions?.includes('settings.manage')) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'customers' && currentUser && !currentUser.permissions?.includes('customers.view')) {
      setActiveTab('dashboard');
    }
    if (['settings-links', 'settings-fields'].includes(activeTab) && currentUser && !currentUser.permissions?.includes('customers.manage')) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'settings-cleanup' && currentUser && currentUser.role !== 'super_admin') {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    window.__monipackNavigate = (tab) => setActiveTab(tab);
    const handleSessionExpired = () => {
      handleLogout(false);
      showToast('Your session has expired. Please log in again.', 'error');
    };
    window.addEventListener('monipack_session_expired', handleSessionExpired);
    return () => {
      delete window.__monipackNavigate;
      window.removeEventListener('monipack_session_expired', handleSessionExpired);
    };
  }, []);

  // Lead Handlers
  const handleOpenNewLead = () => {
    setEditingLead(null);
    setIsLeadModalOpen(true);
  };

  const handleEditLead = (lead) => {
    setEditingLead(lead);
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = async (leadData) => {
    try {
      if (editingLead) {
        const res = await authFetch(`/api/leads/${editingLead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Failed to update lead', 'error');
          return;
        }
        showToast(`Updated lead: ${leadData.name}`);
      } else {
        const res = await authFetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Failed to create lead', 'error');
          return;
        }
        showToast(`Created lead: ${leadData.name}`);
      }
      setIsLeadModalOpen(false);
      setEditingLead(null);
      fetchData();
    } catch (err) {
      showToast('Failed to save lead', 'error');
    }
  };

  const handleDeleteLead = async (id) => {
    try {
      const res = await authFetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to delete lead', 'error');
        return;
      }
      showToast('Lead deleted successfully');
      fetchData();
    } catch (err) {
      showToast('Failed to delete lead', 'error');
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await authFetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to update stage', 'error');
        return;
      }
      showToast('Pipeline stage updated');
      fetchData();
    } catch (err) {
      showToast('Failed to update stage', 'error');
    }
  };

  const handleUpdateLead = async (id, updates) => {
    try {
      const res = await authFetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || 'Failed to update lead';
        showToast(msg, 'error');
        throw new Error(msg);
      }
      fetchData();
      return await res.json();
    } catch (err) {
      showToast(err.message || 'Failed to update lead', 'error');
      throw err;
    }
  };

  const handleLogActivity = async (leadId, act) => {
    try {
      await authFetch(`/api/leads/${leadId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(act),
      });
      fetchData();
    } catch (err) {
      console.error('Failed to log activity', err);
    }
  };

  // Quotation Handlers
  const handleCreateQuotation = async (quoteData, callback) => {
    try {
      const res = await authFetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteData),
      });
      if (res.ok) {
        const created = await res.json();
        showToast(`Quotation ${created.code} created successfully!`);
        fetchData();
        if (callback) callback(created);
      }
    } catch (err) {
      showToast('Failed to create quotation', 'error');
    }
  };

  const handleUpdateQuotation = async (id, updates, callback) => {
    try {
      const res = await authFetch(`/api/quotations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        showToast(`Quotation ${updated.code} updated successfully!`);
        fetchData();
        if (callback) callback(updated);
        return updated;
      }
    } catch (err) {
      showToast('Failed to update quotation', 'error');
    }
  };

  const handleDeleteQuotation = async (id) => {
    try {
      const res = await authFetch(`/api/quotations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Quotation deleted successfully');
        fetchData();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to delete quotation', 'error');
      }
    } catch (err) {
      showToast('Failed to delete quotation', 'error');
    }
  };

  const handleCreateQuoteFromLead = (lead) => {
    setPrefilledLeadForQuote(lead);
    setActiveTab('quotations');
  };

  // Product Handlers
  const handleAddProduct = async (productData) => {
    try {
      const res = await authFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      if (res.ok) {
        showToast(`Product "${productData.name}" added to catalog`);
        fetchData();
      }
    } catch (err) {
      showToast('Failed to add product', 'error');
    }
  };

  const handleUpdateProduct = async (id, productData) => {
    try {
      const res = await authFetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      if (res.ok) {
        showToast(`Product "${productData.name || 'item'}" updated successfully!`);
        fetchData();
        return await res.json();
      }
    } catch (err) {
      showToast('Failed to update product', 'error');
      throw err;
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      const res = await authFetch(`/api/products/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showToast('Product deleted from catalog');
        fetchData();
        return true;
      }
    } catch (err) {
      showToast('Failed to delete product', 'error');
      throw err;
    }
  };

  const handleBulkDeleteProducts = async (ids) => {
    try {
      const res = await authFetch('/api/products/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Deleted ${data.count} products from catalog`);
        fetchData();
        return data;
      }
    } catch (err) {
      showToast('Failed to delete selected products', 'error');
      throw err;
    }
  };

  // If unauthenticated, display Login screen
  if (!token || !currentUser) {
    return (
      <div className="flex flex-col min-h-screen">
        <OfflineBanner />
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Temporary password: the user must choose their own before using the CRM
  if (currentUser.mustChangePassword) {
    return (
      <div className="flex flex-col min-h-screen">
        <OfflineBanner />
        <ChangePassword
          token={token}
          user={currentUser}
          onPasswordChanged={handlePasswordChanged}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Page Title mapping (with responsive shortTitle for mobile viewports)
  const titles = {
    analytics: { title: 'Charts', shortTitle: 'Charts', subtitle: 'Pipeline funnel, categories and branches' },
    'settings-links': { title: 'Salesmen & links', shortTitle: 'Salesmen', subtitle: 'Each salesman\'s secret link, type and PIN' },
    'settings-cleanup': { title: 'Data cleanup', shortTitle: 'Cleanup', subtitle: 'Super admin only: delete test or old data before going live' },
    'settings-fields': { title: 'Customer form', shortTitle: 'Customer form', subtitle: 'Fields salesmen fill in, required fields and dropdown choices' },
    customers: {
      title: 'Customer Data Centre',
      shortTitle: 'Customers',
      subtitle: 'Every customer, enquiry, quotation and document in one place'
    },
    dashboard: { 
      title: 'Home', 
      shortTitle: 'Home', 
      subtitle: 'What needs attention today' 
    },
    customercare: { 
      title: 'Customer Care & Inbound Intake Desk', 
      shortTitle: 'Customer Care', 
      subtitle: 'Step 1 & 2: Call incoming leads, understand requirements & assign to Oman branches' 
    },
    leads: { 
      title: 'Commercial Sales Pipeline', 
      shortTitle: 'Sales Pipeline', 
      subtitle: 'Step 3 to 5: Track quotations, follow-ups, samples, and conversions' 
    },
    quotations: { 
      title: 'Quotation Management System', 
      shortTitle: 'Quotations', 
      subtitle: 'Generate, track, and print official monipack OMR price quotes' 
    },
    products: { 
      title: 'Multi-Brand Product Catalog', 
      shortTitle: 'Catalog', 
      subtitle: 'Packaging, monipack, moniclean, monifood, and Kohe product specifications' 
    },
    branches: { 
      title: 'Oman Branches & Hubs', 
      shortTitle: 'Branches', 
      subtitle: 'Regional coverage, warehouses, and client distribution points' 
    },
    settings: { 
      title: 'Super Admin Control Panel', 
      shortTitle: 'Settings', 
      subtitle: 'User accounts, company legal details, audit logs, and backups' 
    },
  };

  return (
    <>
      <AppLayout
        isMobileDrawerOpen={isMobileDrawerOpen}
        onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
        notifications={
          toast && (
            <div
              className={`fixed mp-toast z-50 px-4 py-3 rounded-2xl text-center sm:text-left shadow-xl border text-xs font-bold animate-in fade-in slide-in-from-bottom-4 duration-200 ${
                toast.type === 'error'
                  ? 'bg-primary text-white border-primary-hover'
                  : 'bg-text-main text-white border-slate-800'
              }`}
            >
              {toast.message}
            </div>
          )
        }
        mobileBottomNav={
          <MobileBottomNav
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setIsMobileDrawerOpen(false);
            }}
            onOpenDrawer={() => setIsMobileDrawerOpen(true)}
            stats={stats}
            currentUser={currentUser}
            onNewLead={handleOpenNewLead}
          />
        }
        sidebar={
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            stats={stats}
            selectedBranch={selectedBranch}
            setSelectedBranch={setSelectedBranch}
            branches={branches}
            currentUser={currentUser}
            onNewLead={handleOpenNewLead}
            onNewQuote={() => setActiveTab('quotations')}
            onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
            onLogout={handleLogout}
          />
        }
        header={
          <Navbar
            title={titles[activeTab]?.title || 'monipack CRM'}
            shortTitle={titles[activeTab]?.shortTitle || titles[activeTab]?.title || 'Dashboard'}
            subtitle={titles[activeTab]?.subtitle || ''}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onRefresh={fetchData}
            loading={loading}
            stats={stats}
            currentUser={currentUser}
            onLogout={handleLogout}
            onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          />
        }
      >
        <SectionTabs section={sectionOf(activeTab, currentUser)} activeTab={activeTab} onChange={setActiveTab} />
        <ErrorBoundary key={activeTab}>
          {activeTab === 'dashboard' && can('customers.view') && (
            <Home
              authFetch={authFetch}
              leads={leads}
              quotations={quotations}
              pipelineStages={pipelineStages}
              currentUser={currentUser}
              onNavigate={setActiveTab}
              onNewLead={handleOpenNewLead}
              canManageCustomers={can('customers.manage')}
              onOpenCustomers={(f) => { setCustomerFilter({ ...f, _k: Date.now() }); setActiveTab('customers'); }}
            />
          )}
          {(activeTab === 'analytics' || (activeTab === 'dashboard' && !can('customers.view'))) && (
          <Dashboard
            stats={stats}
            onNavigate={setActiveTab}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            onSelectBranch={(b) => setSelectedBranch(b)}
          />
        )}

        {activeTab === 'customercare' && (
          <CustomerCare
            leads={leads}
            branches={branches}
            categories={categories}
            onUpdateLead={handleUpdateLead}
            onOpenWhatsApp={(lead) => setWhatsAppLead(lead)}
            onCreateQuoteFromLead={handleCreateQuoteFromLead}
            onNewLead={handleOpenNewLead}
            onEditLead={handleEditLead}
            onDeleteLead={can('leads.archive') ? handleDeleteLead : null}
            canImport={can('leads.import')}
            showToast={showToast}
            onNavigateToPipeline={() => setActiveTab('leads')}
            onRefresh={fetchData}
            token={token}
          />
        )}

        {activeTab === 'leads' && (
          <Leads
            leads={leads}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedBranch={selectedBranch}
            setSelectedBranch={setSelectedBranch}
            branches={branches}
            categories={categories}
            pipelineStages={pipelineStages}
            currentUser={currentUser}
            token={token}
            onNewLead={handleOpenNewLead}
            onEditLead={handleEditLead}
            onUpdateLead={handleUpdateLead}
            onDeleteLead={can('leads.archive') ? handleDeleteLead : null}
            canImport={can('leads.import')}
            onUpdateStatus={handleUpdateStatus}
            onOpenWhatsApp={(lead) => setWhatsAppLead(lead)}
            onCreateQuoteFromLead={handleCreateQuoteFromLead}
            onRefresh={fetchData}
            showToast={showToast}
          />
        )}

        {activeTab === 'quotations' && (
          <Quotations
            quotations={quotations}
            products={products}
            categories={categories}
            leads={leads}
            prefilledLead={prefilledLeadForQuote}
            onClearPrefilledLead={() => setPrefilledLeadForQuote(null)}
            onCreateQuotation={handleCreateQuotation}
            onUpdateQuotation={handleUpdateQuotation}
            onDeleteQuotation={can('quotations.archive') ? handleDeleteQuotation : null}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'products' && (
          <Products
            products={products}
            categories={categories}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onBulkDeleteProducts={handleBulkDeleteProducts}
            onRefresh={fetchData}
            token={token}
            showToast={showToast}
            canManage={can('products.manage')}
          />
        )}

        {activeTab === 'branches' && (
          <Branches
            branches={branches}
            leads={leads}
            onSelectBranch={(b) => setSelectedBranch(b)}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'customers' && can('customers.view') && (
          <Customers key={customerFilter?._k || 'customers'} authFetch={authFetch} showToast={showToast} canManage={can('customers.manage')}
            initialFilter={customerFilter ? (({ _k, ...f }) => f)(customerFilter) : undefined}
            onOpenSettings={can('customers.manage') ? setActiveTab : undefined} />
        )}

        {activeTab === 'settings-links' && can('customers.manage') && (
          <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-24 md:pb-8"><SalesmanLinksPage authFetch={authFetch} showToast={showToast} /></div>
        )}

        {activeTab === 'settings-fields' && can('customers.manage') && (
          <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-24 md:pb-8"><CustomerFieldsPage authFetch={authFetch} showToast={showToast} /></div>
        )}

        {activeTab === 'settings-cleanup' && currentUser?.role === 'super_admin' && (
          <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-24 md:pb-8"><DataCleanup authFetch={authFetch} showToast={showToast} onDone={fetchData} /></div>
        )}

        {activeTab === 'settings' && can('settings.manage') && (
          <Settings
            authFetch={authFetch}
            showToast={showToast}
            currentUser={currentUser}
            onRefreshConfig={fetchData}
            products={products}
          />
        )}
        </ErrorBoundary>
      </AppLayout>

      {/* Modals */}
      <LeadModal
        isOpen={isLeadModalOpen}
        onClose={() => {
          setIsLeadModalOpen(false);
          setEditingLead(null);
        }}
        onSave={handleSaveLead}
        onDeleteLead={can('leads.archive') ? handleDeleteLead : null}
        lead={editingLead}
        branches={branches}
        categories={categories}
        pipelineStages={pipelineStages}
        authFetch={authFetch}
      />

      <WhatsAppModal
        isOpen={Boolean(whatsAppLead)}
        onClose={() => setWhatsAppLead(null)}
        lead={whatsAppLead}
        onLogActivity={handleLogActivity}
      />
    </>
  );
}
