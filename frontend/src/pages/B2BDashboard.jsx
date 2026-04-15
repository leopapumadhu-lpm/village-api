import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const glassStyle = `
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .glass-card {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease;
  }
  .glass-card:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-5px);
  }
  .glass-input {
    backdrop-filter: blur(5px);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
  }
  .glass-input::placeholder {
    color: rgba(255, 255, 255, 0.7);
  }
  .gradient-bg {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
  /* Accessibility - focus styles */
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

// Helper function to safely get auth token
const getAuthToken = () => {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
};

// Helper function for authenticated fetch
const fetchWithAuth = async (url, options = {}) => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('No authentication token found');
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  
  if (response.status === 401) {
    // Token expired - clear storage and redirect
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
    window.location.href = '/b2b/login';
    throw new Error('Session expired. Please login again.');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

export default function B2BDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState(() => {
    // Restore last tab from localStorage
    return localStorage.getItem('b2bLastTab') || 'dashboard';
  });
  const [dashboardData, setDashboardData] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [keysLoading, setKeysLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState(['*']);
  const [showWebhookForm, setShowWebhookForm] = useState(false);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/dashboard`);
      setDashboardData(data.data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
      setError(err.message);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  // Fetch API keys
  const fetchApiKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/apikeys`);
      setApiKeys(data.data || []);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
      setError(err.message);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/payments/invoices`);
      setInvoices(data.data || []);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    }
  }, []);

  // Fetch team members
  const fetchTeamMembers = useCallback(async () => {
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/teams/members`);
      setTeamMembers(data.data || []);
    } catch (err) {
      console.error('Failed to fetch team members:', err);
    }
  }, []);

  // Fetch webhooks
  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/webhooks`);
      setWebhooks(data.data || []);
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    }
  }, []);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/analytics/summary`);
      setAnalyticsData(data.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, []);

  // Initial data fetch based on tab
  useEffect(() => {
    fetchDashboard();
    fetchApiKeys();
    
    // Set up polling for real-time updates (every 30 seconds)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && tab === 'dashboard') {
        fetchDashboard();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [fetchDashboard, fetchApiKeys, tab]);

  // Fetch additional data when tab changes
  useEffect(() => {
    if (tab === 'billing') {
      fetchInvoices();
    } else if (tab === 'teams') {
      fetchTeamMembers();
    } else if (tab === 'webhooks') {
      fetchWebhooks();
    } else if (tab === 'analytics') {
      fetchAnalytics();
    }
    
    // Save last tab to localStorage
    localStorage.setItem('b2bLastTab', tab);
  }, [tab, fetchInvoices, fetchTeamMembers, fetchWebhooks, fetchAnalytics]);

  // Create new API key
  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      setError('Key name is required');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/apikeys`, {
        method: 'POST',
        body: JSON.stringify({ name: newKeyName.trim() })
      });
      
      setCreatedKey(data.data);
      setNewKeyName('');
      setShowCreateForm(false);
      setSuccess('API key created successfully!');
      
      // Refresh the keys list
      await fetchApiKeys();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Revoke API key
  const handleRevokeKey = async (keyId, keyName) => {
    if (!window.confirm(`Revoke API key "${keyName}"? This action cannot be undone and the key will stop working immediately.`)) {
      return;
    }

    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/apikeys/${keyId}`, {
        method: 'DELETE'
      });
      
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      setSuccess(`API key "${keyName}" revoked successfully`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Regenerate API key secret
  const handleRegenerateSecret = async (keyId, keyName) => {
    if (!window.confirm(`Regenerate secret for "${keyName}"? The old secret will stop working immediately.`)) {
      return;
    }

    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/b2b/apikeys/${keyId}/regenerate`, {
        method: 'POST'
      });
      
      alert(`New secret: ${data.data.secret}\n\n${data.data.warning}`);
      await fetchApiKeys();
    } catch (err) {
      setError(err.message);
    }
  };

  // Copy to clipboard
  const handleCopyToClipboard = async (text, keyId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setError('Failed to copy to clipboard');
    }
  };

  // Invite team member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail) {
      setError('Email is required');
      return;
    }
    
    setLoading(true);
    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/teams/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteForm(false);
      await fetchTeamMembers();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create webhook
  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!webhookUrl) {
      setError('Webhook URL is required');
      return;
    }
    
    setLoading(true);
    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({ url: webhookUrl, events: webhookEvents })
      });
      
      setSuccess('Webhook created successfully');
      setWebhookUrl('');
      setWebhookEvents(['*']);
      setShowWebhookForm(false);
      await fetchWebhooks();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete webhook
  const handleDeleteWebhook = async (webhookId) => {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    
    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/webhooks/${webhookId}`, {
        method: 'DELETE'
      });
      
      setWebhooks(webhooks.filter(w => w.id !== webhookId));
      setSuccess('Webhook deleted successfully');
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Memoized stats for dashboard
  const dashboardStats = useMemo(() => {
    if (!dashboardData) return [];
    return [
      { label: 'Current Plan', value: dashboardData.plan, icon: '📊', color: 'text-purple-200' },
      { label: "Today's Usage", value: `${dashboardData.todayUsage?.toLocaleString() || 0}/${dashboardData.dailyLimit?.toLocaleString() || 0}`, icon: '📈', color: 'text-blue-200' },
      { label: 'Avg Response', value: `${dashboardData.avgResponseTime || 0}ms`, icon: '⚡', color: dashboardData.avgResponseTime < 100 ? 'text-green-200' : 'text-yellow-200' },
      { label: 'Success Rate', value: `${dashboardData.successRate || 0}%`, icon: '✅', color: dashboardData.successRate > 95 ? 'text-green-200' : 'text-yellow-200' }
    ];
  }, [dashboardData]);

  // Loading state
  if (dashboardLoading && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-screen text-white gradient-bg">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg overflow-hidden">
      <style>{glassStyle}</style>

      {/* Animated background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
      </div>

      {/* Header */}
      <header className="glass-card border-b backdrop-blur-md sticky top-0 z-40" style={{ animation: 'slideDown 0.6s ease-out' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">🚀 B2B Portal</h1>
            <p className="text-xs sm:text-sm text-gray-200">{user?.businessName || 'Business Dashboard'}</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="glass-card px-2 sm:px-3 py-1 rounded-lg text-xs text-green-200 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              Live
            </span>
            <div className="text-right text-xs sm:text-sm text-white">
              <p className="font-medium truncate max-w-[150px] sm:max-w-none">{user?.email}</p>
              <button
                onClick={logout}
                className="text-purple-200 hover:text-white text-xs mt-1 transition"
                aria-label="Logout"
              >
                Logout →
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        {/* Notifications */}
        {error && (
          <div className="mb-6 p-4 glass-card rounded-2xl border border-red-400 text-red-100 text-sm" role="alert">
            ⚠️ {error}
            <button 
              onClick={() => setError('')} 
              className="float-right hover:text-white"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 glass-card rounded-2xl border border-green-400 text-green-100 text-sm" role="status">
            ✅ {success}
            <button 
              onClick={() => setSuccess('')} 
              className="float-right hover:text-white"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation - Responsive */}
        <div className="glass-card rounded-2xl p-1 mb-6 sm:mb-8 flex flex-wrap gap-1 overflow-x-auto" style={{ animation: 'fadeIn 0.8s ease-out' }}>
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'billing', label: '💳 Billing' },
            { id: 'teams', label: '👥 Teams' },
            { id: 'apikeys', label: '🔑 API Keys' },
            { id: 'analytics', label: '📈 Analytics' },
            { id: 'webhooks', label: '🪝 Webhooks' },
            { id: 'docs', label: '📚 Docs' }
          ].map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-medium text-sm transition whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white text-purple-600 shadow-lg'
                  : 'text-white hover:bg-white hover:bg-opacity-10'
              }`}
              style={{ animation: `slideDown 0.6s ease-out ${i * 0.1}s backwards` }}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}

        {/* Dashboard Tab */}
        {tab === 'dashboard' && dashboardData && (
          <div style={{ animation: 'slideUp 0.6s ease-out' }}>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {dashboardStats.map(({ label, value, icon, color }, i) => (
                <div 
                  key={label} 
                  className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white" 
                  style={{ animation: `slideUp 0.6s ease-out ${i * 0.1}s backwards` }}
                >
                  <p className="text-3xl sm:text-4xl mb-2 sm:mb-3">{icon}</p>
                  <p className="text-xs sm:text-sm text-gray-200 mb-1 sm:mb-2">{label}</p>
                  <p className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Usage Chart */}
            <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-8 mb-6 sm:mb-8 text-white" style={{ animation: 'slideUp 0.8s ease-out' }}>
              <h3 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Last 7 Days Usage</h3>
              <div style={{ height: 250, width: '100%' }}>
                {dashboardData.chartData && dashboardData.chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} 
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} 
                        tickLine={false}
                        tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          background: 'rgba(0,0,0,0.8)', 
                          border: '1px solid rgba(255,255,255,0.2)', 
                          borderRadius: '12px',
                          fontSize: '12px'
                        }} 
                      />
                      <Line type="monotone" dataKey="requests" stroke="#a78bfa" strokeWidth={3} dot={{ fill: '#a78bfa', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-300 text-center py-12">No usage data available yet</p>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[
                { label: 'API Documentation', icon: '📚', link: '/api-docs', external: true },
                { label: 'Support & Help', icon: '💬', link: 'mailto:support@villageapi.com', external: true },
                { label: 'API Status', icon: '🔍', link: '/health', external: false }
              ].map(({ label, icon, link, external }, i) => (
                <a
                  key={label}
                  href={link}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white text-center hover:scale-105 transition"
                  style={{ animation: `slideUp 1s ease-out ${0.4 + i * 0.1}s backwards` }}
                >
                  <p className="text-3xl sm:text-4xl mb-2 sm:mb-3">{icon}</p>
                  <p className="font-semibold text-sm sm:text-base">{label}</p>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {tab === 'apikeys' && (
          <div style={{ animation: 'slideUp 0.6s ease-out' }}>
            {createdKey && (
              <div className="mb-6 sm:mb-8 p-4 sm:p-6 glass-card rounded-2xl border border-green-400 text-green-100" style={{ animation: 'slideUp 0.4s ease-out' }}>
                <h3 className="font-bold mb-3 sm:mb-4 text-base sm:text-lg">✅ API Key Created!</h3>
                <div className="space-y-4 font-mono text-xs sm:text-sm">
                  <div>
                    <p className="text-green-200 text-xs mb-2">API Key:</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <code className="glass-card px-3 sm:px-4 py-2 rounded-lg flex-1 break-all text-xs sm:text-sm">{createdKey.key}</code>
                      <button
                        onClick={() => handleCopyToClipboard(createdKey.key, 'key')}
                        className="glass-card px-3 sm:px-4 py-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition"
                      >
                        {copiedKeyId === 'key' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-green-200 text-xs mb-2">Secret:</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <code className="glass-card px-3 sm:px-4 py-2 rounded-lg flex-1 break-all text-xs sm:text-sm">{createdKey.secret}</code>
                      <button
                        onClick={() => handleCopyToClipboard(createdKey.secret, 'secret')}
                        className="glass-card px-3 sm:px-4 py-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition"
                      >
                        {copiedKeyId === 'secret' ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <p className="text-yellow-200 text-xs">{createdKey.warning}</p>
                </div>
                <button
                  onClick={() => setCreatedKey(null)}
                  className="mt-4 text-green-200 hover:text-white transition font-medium text-sm"
                >
                  Done
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Your API Keys</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="glass-card rounded-xl px-4 sm:px-6 py-2 text-white font-medium hover:bg-white hover:bg-opacity-20 transition text-sm"
              >
                + Create New Key
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateKey} className="mb-6 sm:mb-8 p-4 sm:p-6 glass-card rounded-2xl text-white" style={{ animation: 'slideUp 0.4s ease-out' }}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Key Name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production Server"
                    className="glass-input w-full px-3 sm:px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 text-sm"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-300 mt-1">Give your key a descriptive name to remember its purpose</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="glass-card px-4 sm:px-6 py-2 rounded-lg font-medium hover:bg-white hover:bg-opacity-20 transition disabled:opacity-50 text-sm"
                  >
                    {loading ? 'Creating...' : 'Create Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="glass-card px-4 sm:px-6 py-2 rounded-lg font-medium hover:bg-white hover:bg-opacity-20 transition text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* API Keys List */}
            <div className="glass-card rounded-2xl overflow-hidden text-white">
              {keysLoading ? (
                <div className="p-12 text-center text-gray-400">Loading API keys...</div>
              ) : apiKeys.length > 0 ? (
                <div className="divide-y divide-white divide-opacity-10">
                  {apiKeys.map((key, idx) => (
                    <div key={key.id} className="p-4 hover:bg-white hover:bg-opacity-10 transition" style={{ animation: `slideUp 0.6s ease-out ${0.1 + idx * 0.05}s backwards` }}>
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs sm:text-sm text-purple-200 break-all">{key.key}</p>
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-300">
                            <span>📛 {key.name}</span>
                            <span className={key.isActive ? 'text-green-300' : 'text-red-300'}>
                              {key.isActive ? '🟢 Active' : '🔴 Inactive'}
                            </span>
                            <span>📅 Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</span>
                            <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopyToClipboard(key.key, key.id)}
                            className="text-xs hover:text-purple-300 transition"
                            aria-label="Copy API key"
                          >
                            {copiedKeyId === key.id ? '✓ Copied' : 'Copy'}
                          </button>
                          <button
                            onClick={() => handleRegenerateSecret(key.id, key.name)}
                            className="text-xs hover:text-yellow-300 transition"
                            aria-label="Regenerate secret"
                          >
                            Regenerate
                          </button>
                          <button
                            onClick={() => handleRevokeKey(key.id, key.name)}
                            className="text-xs hover:text-red-400 transition"
                            aria-label="Revoke API key"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 sm:p-12 text-center text-gray-400">
                  <p className="text-lg mb-2">🔑 No API keys yet</p>
                  <p className="text-xs sm:text-sm">Create one to start querying 619K villages</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Billing Tab */}
        {tab === 'billing' && (
          <div className="space-y-6" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h2 className="text-xl sm:text-2xl font-bold mb-6">Pricing Plans</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { name: 'FREE', price: '$0', requests: '1,000/day', features: ['Basic API Access', 'Email Support', '5,000 requests/day'], color: 'gray' },
                  { name: 'PREMIUM', price: '$49', requests: '50,000/day', features: ['Analytics Dashboard', 'Priority Support', 'Team Access (3 seats)'], highlight: true, color: 'purple' },
                  { name: 'PRO', price: '$199', requests: '300,000/day', features: ['Webhooks', '24/7 Support', 'Team Access (10 seats)', 'Advanced Analytics'], color: 'blue' },
                  { name: 'UNLIMITED', price: '$499', requests: '1M+/day', features: ['Custom Limits', 'Dedicated Support', 'Unlimited Team', 'SLA Guarantee'], color: 'gold' }
                ].map(plan => (
                  <div 
                    key={plan.name} 
                    className={`glass-card rounded-2xl p-4 sm:p-6 ${plan.highlight ? 'border-2 border-purple-300 scale-100 sm:scale-105 z-10' : ''}`}
                  >
                    <h3 className="font-bold text-base sm:text-lg mb-2">{plan.name}</h3>
                    <p className="text-xl sm:text-2xl font-bold mb-2">{plan.price}<span className="text-xs font-normal">/mo</span></p>
                    <p className="text-xs text-gray-300 mb-4">{plan.requests}</p>
                    <ul className="text-xs space-y-2 mb-6">
                      {plan.features.map(f => <li key={f}>✅ {f}</li>)}
                    </ul>
                    <button 
                      className={`w-full py-2 rounded-lg font-medium transition text-sm ${
                        dashboardData?.plan === plan.name
                          ? 'bg-green-500 text-white cursor-default'
                          : plan.highlight 
                            ? 'bg-white text-purple-600 hover:shadow-lg' 
                            : 'glass-card hover:bg-white hover:bg-opacity-20'
                      }`}
                      disabled={dashboardData?.plan === plan.name}
                      onClick={() => window.location.href = '/payments/checkout'}
                    >
                      {dashboardData?.plan === plan.name ? 'Current Plan' : plan.name === 'FREE' ? 'Downgrade' : 'Upgrade'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h2 className="text-xl sm:text-2xl font-bold mb-6">Payment Methods</h2>
              {invoices.length > 0 ? (
                <div className="space-y-3">
                  {/* Payment methods would go here */}
                  <p className="text-gray-300">Manage your payment methods</p>
                </div>
              ) : (
                <>
                  <p className="text-gray-300 mb-4">No payment methods on file yet</p>
                  <button className="glass-card rounded-lg px-4 sm:px-6 py-2 hover:bg-white hover:bg-opacity-20 transition text-sm">
                    + Add Payment Method
                  </button>
                </>
              )}
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h2 className="text-xl sm:text-2xl font-bold mb-6">Invoices</h2>
              {invoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white border-opacity-10">
                        <th className="text-left py-2 px-2">Invoice #</th>
                        <th className="text-left py-2 px-2">Date</th>
                        <th className="text-left py-2 px-2">Amount</th>
                        <th className="text-left py-2 px-2">Status</th>
                        <th className="text-left py-2 px-2">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id} className="border-b border-white border-opacity-10">
                          <td className="py-2 px-2">{inv.invoiceNumber}</td>
                          <td className="py-2 px-2">{new Date(inv.issuedAt).toLocaleDateString()}</td>
                          <td className="py-2 px-2">${inv.total}</td>
                          <td className="py-2 px-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              inv.status === 'PAID' ? 'bg-green-500 bg-opacity-20 text-green-200' : 'bg-yellow-500 bg-opacity-20 text-yellow-200'
                            }`}>
                              {inv.status}
                            </span>
                           </td>
                          <td className="py-2 px-2">
                            {inv.pdfUrl && (
                              <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-white">
                                View PDF
                              </a>
                            )}
                           </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-300 text-center py-8">No invoices yet</p>
              )}
            </div>
          </div>
        )}

        {/* Teams Tab */}
        {tab === 'teams' && (
          <div className="glass-card rounded-2xl p-4 sm:p-8 text-white" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Team Members</h2>
                <p className="text-xs text-gray-300 mt-1">Collaborate with your team members</p>
              </div>
              <button 
                onClick={() => setShowInviteForm(!showInviteForm)}
                className="glass-card rounded-lg px-4 sm:px-6 py-2 hover:bg-white hover:bg-opacity-20 transition text-sm"
              >
                {showInviteForm ? 'Cancel' : '+ Invite Member'}
              </button>
            </div>

            {showInviteForm && (
              <form onSubmit={handleInviteMember} className="mb-6 p-4 glass-card rounded-xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="team@example.com"
                    className="glass-input px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                    required
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="glass-input px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={loading}
                    className="glass-card px-4 py-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {/* Current user (owner) */}
              <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <p className="font-semibold">You</p>
                  <p className="text-xs text-gray-300">{user?.email}</p>
                  <p className="text-xs text-purple-300 mt-1">Role: Owner</p>
                </div>
                <span className="glass-card rounded-lg px-3 py-1 text-xs font-medium">👑 Owner</span>
              </div>
              
              {/* Team members */}
              {teamMembers.length > 0 ? (
                teamMembers.map(member => (
                  <div key={member.id} className="glass-card rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <p className="font-semibold">{member.name || member.email}</p>
                      <p className="text-xs text-gray-300">{member.email}</p>
                      <p className="text-xs text-purple-300 mt-1">Role: {member.role}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        member.status === 'ACTIVE' ? 'bg-green-500 bg-opacity-20 text-green-200' : 'bg-yellow-500 bg-opacity-20 text-yellow-200'
                      }`}>
                        {member.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No team members yet</p>
                  <p className="text-xs mt-1">Invite your colleagues to collaborate</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {tab === 'analytics' && (
          <div className="space-y-6" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Requests', value: analyticsData?.totalRequests?.toLocaleString() || '0', trend: '+12%' },
                { label: 'Avg Response', value: analyticsData?.avgResponseTime ? `${analyticsData.avgResponseTime}ms` : '0ms', trend: '-8%' },
                { label: 'Success Rate', value: analyticsData?.successRate ? `${analyticsData.successRate}%` : '0%', trend: '+2%' },
                { label: 'Error Rate', value: analyticsData?.errorRate ? `${analyticsData.errorRate}%` : '0%', trend: '-0.5%' }
              ].map(stat => (
                <div key={stat.label} className="glass-card rounded-2xl p-4 sm:p-6 text-white">
                  <p className="text-xs text-gray-300 mb-2">{stat.label}</p>
                  <p className="text-xl sm:text-3xl font-bold mb-2">{stat.value}</p>
                  <p className="text-xs text-green-300">{stat.trend} this period</p>
                </div>
              ))}
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-4">Top Endpoints</h3>
              {analyticsData?.endpointStats ? (
                <div className="space-y-4">
                  {Object.entries(analyticsData.endpointStats).slice(0, 5).map(([endpoint, stats]) => (
                    <div key={endpoint}>
                      <div className="flex flex-col sm:flex-row justify-between text-xs sm:text-sm mb-1 gap-1">
                        <code className="text-purple-200 break-all">{endpoint}</code>
                        <span className="text-gray-300">{stats.count.toLocaleString()} requests</span>
                      </div>
                      <div className="glass-card rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-purple-400 h-full transition" 
                          style={{ width: `${(stats.count / analyticsData.totalRequests) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-300 text-center py-8">No analytics data available yet</p>
              )}
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-4">Response Time Percentiles</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-300">p50</p>
                  <p className="text-xl font-bold">{analyticsData?.p50ResponseTime || 0}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-300">p90</p>
                  <p className="text-xl font-bold">{analyticsData?.p90ResponseTime || 0}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-300">p95</p>
                  <p className="text-xl font-bold">{analyticsData?.p95ResponseTime || 0}ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-300">p99</p>
                  <p className="text-xl font-bold">{analyticsData?.p99ResponseTime || 0}ms</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks Tab */}
        {tab === 'webhooks' && (
          <div className="space-y-6" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold mb-1">🪝 Webhooks</h2>
                  <p className="text-xs text-gray-300">Receive real-time events for your integrations</p>
                </div>
                <button 
                  onClick={() => setShowWebhookForm(!showWebhookForm)}
                  className="glass-card rounded-lg px-4 sm:px-6 py-2 hover:bg-white hover:bg-opacity-20 transition text-sm"
                >
                  {showWebhookForm ? 'Cancel' : '+ Add Webhook'}
                </button>
              </div>

              {showWebhookForm && (
                <form onSubmit={handleCreateWebhook} className="mb-6 p-4 glass-card rounded-xl">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Endpoint URL</label>
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://your-app.com/webhook"
                        className="glass-input w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Events</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['user.approved', 'payment.received', 'api_key.created', 'quota.warning'].map(event => (
                          <label key={event} className="flex items-center gap-2 glass-card rounded-lg p-2 hover:bg-white hover:bg-opacity-10 transition cursor-pointer">
                            <input
                              type="checkbox"
                              value={event}
                              checked={webhookEvents.includes(event)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setWebhookEvents([...webhookEvents, event]);
                                } else {
                                  setWebhookEvents(webhookEvents.filter(ev => ev !== event));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-xs">{event}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="glass-card px-4 py-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition disabled:opacity-50"
                    >
                      {loading ? 'Creating...' : 'Create Webhook'}
                    </button>
                  </div>
                </form>
              )}

              {webhooks.length > 0 ? (
                <div className="space-y-3">
                  {webhooks.map(webhook => (
                    <div key={webhook.id} className="glass-card rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs break-all">{webhook.url}</p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-300">
                          <span>Events: {webhook.events?.join(', ') || '*'}</span>
                          <span className={webhook.isActive ? 'text-green-300' : 'text-red-300'}>
                            {webhook.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          className="text-xs hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-base sm:text-lg mb-2">🔗 No webhooks configured yet</p>
                  <p className="text-xs sm:text-sm">Add a webhook endpoint to receive real-time events</p>
                </div>
              )}
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-4">Available Events</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { event: 'user.approved', desc: 'When a user account is approved' },
                  { event: 'payment.received', desc: 'When a payment is successfully processed' },
                  { event: 'api_key.created', desc: 'When a new API key is created' },
                  { event: 'quota.warning', desc: 'When usage reaches 80% or 95% of quota' }
                ].map(({ event, desc }) => (
                  <div key={event} className="glass-card rounded-lg p-3">
                    <code className="text-purple-200 text-xs block">{event}</code>
                    <p className="text-xs text-gray-300 mt-1">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-2xl p-4 sm:p-8 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-4">Delivery Logs</h3>
              <div className="text-center py-12 text-gray-400">
                No webhook deliveries yet
              </div>
            </div>
          </div>
        )}

        {/* Documentation Tab */}
        {tab === 'docs' && (
          <div className="glass-card rounded-2xl p-4 sm:p-8 text-white" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <h2 className="text-xl sm:text-2xl font-bold mb-6">📚 API Documentation</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-bold mb-2 text-sm sm:text-base">Base URL</h3>
                <code className="glass-card block p-3 rounded-lg font-mono text-xs sm:text-sm break-all">
                  {import.meta.env.VITE_API_URL}/v1
                </code>
              </div>

              <div>
                <h3 className="font-bold mb-2 text-sm sm:text-base">Authentication</h3>
                <p className="text-gray-300 text-xs sm:text-sm mb-2">All requests require your API key in the header:</p>
                <code className="glass-card block p-3 rounded-lg font-mono text-xs sm:text-sm">
                  X-API-Key: your_api_key_here
                </code>
              </div>

              <div>
                <h3 className="font-bold mb-3 text-sm sm:text-base">Popular Endpoints</h3>
                <div className="space-y-2">
                  {[
                    { endpoint: 'GET /states', desc: 'List all Indian states' },
                    { endpoint: 'GET /states/{id}/districts', desc: 'Get districts for a state' },
                    { endpoint: 'GET /districts/{id}/subdistricts', desc: 'Get sub-districts for a district' },
                    { endpoint: 'GET /subdistricts/{id}/villages', desc: 'Get villages for a sub-district' },
                    { endpoint: 'GET /search?q=name', desc: 'Search for villages by name' },
                    { endpoint: 'GET /autocomplete?q=query', desc: 'Get autocomplete suggestions' }
                  ].map(({ endpoint, desc }) => (
                    <div key={endpoint} className="glass-card rounded-lg p-3">
                      <code className="text-purple-200 block font-mono text-xs sm:text-sm break-all">{endpoint}</code>
                      <p className="text-xs text-gray-300 mt-1">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-bold mb-2 text-sm sm:text-base">Example Request</h3>
                <pre className="glass-card p-3 sm:p-4 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap">
{`curl -H "X-API-Key: YOUR_API_KEY" \\
  "${import.meta.env.VITE_API_URL}/v1/states"`}
                </pre>
              </div>

              <div className="text-center pt-4">
                <a 
                  href="http://localhost:3000/api-docs" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="glass-card rounded-lg px-4 sm:px-6 py-2 sm:py-3 hover:bg-white hover:bg-opacity-20 transition font-medium inline-block text-sm"
                >
                  📖 View Full API Docs →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
