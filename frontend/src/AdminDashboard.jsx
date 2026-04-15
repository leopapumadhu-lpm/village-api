import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "./hooks/useAuth";
import { getStates, getDistricts, getSubDistricts, getVillages } from "./api";

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
  .gradient-bg {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
  /* Accessibility - focus styles */
  button:focus-visible, select:focus-visible, a:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
    border-radius: 4px;
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  /* Scrollbar styling */
  .overflow-x-auto::-webkit-scrollbar {
    height: 6px;
  }
  .overflow-x-auto::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }
  .overflow-x-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
  .overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

const TABS = ["Overview", "API Logs", "Users", "Data Browser"];

// Helper function to safely get auth token
const getAuthToken = () => {
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
};

// Helper function to handle API requests with error handling
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
    // Token expired - redirect to login
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUser');
    window.location.href = '/admin/login';
    throw new Error('Session expired. Please login again.');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
};

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  
  return (
    <div className={`fixed bottom-4 right-4 z-50 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slideUp`}>
      <span>{type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">✕</button>
    </div>
  );
};

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const [tab, setTab] = useState(() => {
    // Restore last tab from localStorage
    return localStorage.getItem('adminLastTab') || "Overview";
  });
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSubDistrict, setSelectedSubDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState({ totalVillages: 0, activeUsers: 0, totalRequests: 0, pendingApprovals: 0 });
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [toast, setToast] = useState(null);
  const pollingRef = useRef(null);

  // Show toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Fetch analytics with loading state
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/admin/analytics`);
      setAnalytics(data.data || { totalVillages: 619225, activeUsers: 0, totalRequests: 0, pendingApprovals: 0 });
      
      // Generate real chart data from API if available, otherwise mock
      if (data.data?.chartData) {
        setChartData(data.data.chartData);
      } else {
        // Generate mock chart data for demo (in production, use real data)
        const mockData = Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
          requests: Math.floor(Math.random() * 80000 + 20000)
        }));
        setChartData(mockData);
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      // Don't show error to user for analytics, use fallback
      setAnalytics({ totalVillages: 619225, activeUsers: 0, totalRequests: 0, pendingApprovals: 0 });
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Fetch logs with pagination
  const fetchLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/admin/logs?page=${page}&limit=50`);
      setLogs(data.data || []);
      setLogsTotal(data.pagination?.total || 0);
      setLogsPage(page);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
      showToast('Failed to load logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await fetchWithAuth(`${import.meta.env.VITE_API_URL}/admin/users`);
      setUsers(data.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setUsers([]);
      showToast('Failed to load users', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Approve user
  const approveUser = useCallback(async (userId, businessName) => {
    if (!window.confirm(`Approve ${businessName}? They will receive an email notification.`)) {
      return;
    }
    
    setActionInProgress(userId);
    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/admin/users/${userId}/approve`, {
        method: 'PATCH',
      });
      
      // Refresh users list
      await fetchUsers();
      
      showToast(`✅ ${businessName} has been approved`, 'success');
    } catch (err) {
      console.error('Failed to approve user:', err);
      showToast(`Failed to approve user: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  }, [fetchUsers]);

  // Update user plan
  const updateUserPlan = useCallback(async (userId, currentPlan, newPlan) => {
    if (!window.confirm(`Change plan from ${currentPlan} to ${newPlan}?`)) {
      return;
    }
    
    setActionInProgress(userId);
    try {
      await fetchWithAuth(`${import.meta.env.VITE_API_URL}/admin/users/${userId}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ planType: newPlan }),
      });
      
      // Refresh users list
      await fetchUsers();
      showToast(`✅ Plan updated to ${newPlan}`, 'success');
    } catch (err) {
      console.error('Failed to update plan:', err);
      showToast(`Failed to update plan: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  }, [fetchUsers]);

  // Load states
  useEffect(() => {
    const loadStates = async () => {
      try {
        setError(null);
        const data = await getStates();
        setStates(data || []);
      } catch (error) {
        console.error("Failed to load states:", error);
        setError(error.message);
        showToast('Failed to load states', 'error');
      }
    };
    loadStates();
  }, []);

  // Load districts
  useEffect(() => {
    if (selectedState) {
      const loadDistricts = async () => {
        try {
          setLoading(true);
          const data = await getDistricts(parseInt(selectedState));
          setDistricts(data || []);
          setSelectedDistrict("");
          setSubDistricts([]);
          setVillages([]);
        } catch (error) {
          console.error("Failed to load districts:", error);
          setError(error.message);
          showToast('Failed to load districts', 'error');
        } finally {
          setLoading(false);
        }
      };
      loadDistricts();
    }
  }, [selectedState]);

  // Load sub-districts
  useEffect(() => {
    if (selectedDistrict) {
      const loadSubDistricts = async () => {
        try {
          setLoading(true);
          const data = await getSubDistricts(parseInt(selectedDistrict));
          setSubDistricts(data || []);
          setSelectedSubDistrict("");
          setVillages([]);
        } catch (error) {
          console.error("Failed to load subdistricts:", error);
          setError(error.message);
          showToast('Failed to load sub-districts', 'error');
        } finally {
          setLoading(false);
        }
      };
      loadSubDistricts();
    }
  }, [selectedDistrict]);

  // Load villages
  useEffect(() => {
    if (selectedSubDistrict) {
      const loadVillages = async () => {
        try {
          setLoading(true);
          const data = await getVillages(parseInt(selectedSubDistrict));
          setVillages(data || []);
        } catch (error) {
          console.error("Failed to load villages:", error);
          setError(error.message);
          showToast('Failed to load villages', 'error');
        } finally {
          setLoading(false);
        }
      };
      loadVillages();
    }
  }, [selectedSubDistrict]);

  // Initial data fetch
  useEffect(() => {
    fetchAnalytics();
    fetchLogs();
    fetchUsers();
    
    // Set up polling for real-time updates (every 30 seconds)
    pollingRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAnalytics();
      }
    }, 30000);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchAnalytics, fetchLogs, fetchUsers]);

  // Save last tab to localStorage
  useEffect(() => {
    localStorage.setItem('adminLastTab', tab);
  }, [tab]);

  // Memoized stats for performance
  const stats = useMemo(() => [
    { label: "Total Villages", value: analytics.totalVillages?.toLocaleString() || "619,225", icon: "🏘️", color: "text-purple-200" },
    { label: "Active Users", value: analytics.activeUsers?.toLocaleString() || "0", icon: "👥", color: "text-blue-200" },
    { label: "Total Requests", value: analytics.totalRequests?.toLocaleString() || "0", icon: "📊", color: "text-green-200" },
    { label: "Pending Approvals", value: analytics.pendingApprovals?.toLocaleString() || "0", icon: "⏳", color: analytics.pendingApprovals > 0 ? "text-yellow-200" : "text-gray-200" }
  ], [analytics]);

  // Handle tab change
  const handleTabChange = useCallback((newTab) => {
    setTab(newTab);
    // Refresh data when switching tabs
    if (newTab === "API Logs") {
      fetchLogs(1);
    } else if (newTab === "Users") {
      fetchUsers();
    }
  }, [fetchLogs, fetchUsers]);

  return (
    <div className="min-h-screen gradient-bg overflow-hidden">
      <style>{glassStyle}</style>

      {/* Toast Notifications */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Animated background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
      </div>

      {/* Header */}
      <header className="glass-card border-b backdrop-blur-md sticky top-0 z-40" style={{ animation: 'slideDown 0.6s ease-out' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">🛡️ Admin Panel</h1>
            <p className="text-xs sm:text-sm text-gray-200">All India Villages API Management</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="glass-card px-2 sm:px-3 py-1 rounded-lg text-xs text-green-200 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              <span className="hidden sm:inline">Live</span>
            </div>
            <div className="text-right text-xs sm:text-sm text-white">
              <p className="font-medium truncate max-w-[120px] sm:max-w-none">{user?.email || 'Admin'}</p>
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
        {/* Tab Navigation - Responsive */}
        <div className="glass-card rounded-2xl p-1 mb-6 sm:mb-8 flex flex-wrap gap-1 overflow-x-auto" style={{ animation: 'fadeIn 0.8s ease-out' }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-medium text-sm transition whitespace-nowrap ${
                tab === t
                  ? 'bg-white text-purple-600 shadow-lg'
                  : 'text-white hover:bg-white hover:bg-opacity-10'
              }`}
              style={{ animation: `slideDown 0.6s ease-out ${i * 0.1}s backwards` }}
              aria-current={tab === t ? 'page' : undefined}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === "Overview" && (
          <div style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {stats.map(({ label, value, icon, color }, i) => (
                <div 
                  key={label} 
                  className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white" 
                  style={{ animation: `slideUp 0.6s ease-out ${i * 0.1}s backwards` }}
                >
                  <p className="text-3xl sm:text-4xl mb-2 sm:mb-3">{icon}</p>
                  <p className="text-xs sm:text-sm text-gray-200 mb-1 sm:mb-2">{label}</p>
                  <p className={`text-xl sm:text-3xl font-bold ${color}`}>
                    {analyticsLoading ? (
                      <span className="inline-block w-16 h-8 bg-white bg-opacity-20 rounded animate-pulse"></span>
                    ) : (
                      value
                    )}
                  </p>
                </div>
              ))}
            </div>

            <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-8 text-white" style={{ animation: 'slideUp 0.8s ease-out' }}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <p className="font-bold text-base sm:text-lg">📊 API Requests — Last 30 Days</p>
                <button 
                  onClick={fetchAnalytics}
                  className="text-xs text-purple-200 hover:text-white transition"
                  aria-label="Refresh chart"
                >
                  🔄 Refresh
                </button>
              </div>
              <div style={{ height: 250, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} 
                      tickLine={false} 
                      interval={Math.floor(chartData.length / 6)}
                    />
                    <YAxis 
                      tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }} 
                      tickLine={false} 
                      axisLine={false}
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
                    <Area type="monotone" dataKey="requests" stroke="#a78bfa" strokeWidth={2} fill="rgba(167, 139, 250, 0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {tab === "Users" && (
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-8 text-white overflow-hidden" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <p className="font-bold text-base sm:text-lg">👥 Registered Users</p>
              <div className="flex items-center gap-3">
                <button 
                  onClick={fetchUsers}
                  className="text-xs text-purple-200 hover:text-white transition"
                  aria-label="Refresh users"
                >
                  🔄 Refresh
                </button>
                <p className="text-xs text-gray-300">Total: {users.length}</p>
              </div>
            </div>
            
            {usersLoading ? (
              <div className="py-12 text-center text-gray-400">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white mb-2"></div>
                <p>Loading users...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-white border-opacity-10">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Business</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200 hidden sm:table-cell">Email</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Plan</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Status</th>
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length > 0 ? (
                      users.map((u) => (
                        <tr key={u.id} className="border-b border-white border-opacity-10 hover:bg-white hover:bg-opacity-10 transition">
                          <td className="py-2 sm:py-3 px-2 sm:px-4 font-medium">
                            <div>
                              <div className="truncate max-w-[120px] sm:max-w-none">{u.businessName}</div>
                              <div className="text-gray-400 text-xs sm:hidden">{u.email}</div>
                            </div>
                           </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4 text-gray-300 hidden sm:table-cell">{u.email}</td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4">
                            <select
                              value={u.planType}
                              onChange={(e) => updateUserPlan(u.id, u.planType, e.target.value)}
                              disabled={actionInProgress === u.id}
                              className="glass-card rounded-lg px-1 sm:px-2 py-1 text-xs bg-transparent border border-white border-opacity-20 focus:outline-none focus:ring-1 focus:ring-purple-300"
                              aria-label={`Change plan for ${u.businessName}`}
                            >
                              <option className="bg-gray-900">FREE</option>
                              <option className="bg-gray-900">PREMIUM</option>
                              <option className="bg-gray-900">PRO</option>
                              <option className="bg-gray-900">UNLIMITED</option>
                            </select>
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4">
                            <span className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg text-xs font-medium ${
                              u.status === "ACTIVE" 
                                ? 'bg-green-500 bg-opacity-20 text-green-200' 
                                : u.status === "PENDING_APPROVAL"
                                ? 'bg-yellow-500 bg-opacity-20 text-yellow-200'
                                : 'bg-red-500 bg-opacity-20 text-red-200'
                            }`}>
                              {u.status === "PENDING_APPROVAL" ? "Pending" : u.status}
                            </span>
                          </td>
                          <td className="py-2 sm:py-3 px-2 sm:px-4">
                            {u.status === "PENDING_APPROVAL" && (
                              <button
                                onClick={() => approveUser(u.id, u.businessName)}
                                disabled={actionInProgress === u.id}
                                className="bg-green-500 bg-opacity-80 hover:bg-opacity-100 px-2 sm:px-3 py-1 rounded-lg text-xs transition disabled:opacity-50"
                                aria-label={`Approve ${u.businessName}`}
                              >
                                {actionInProgress === u.id ? '...' : 'Approve'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="py-12 text-center text-gray-400">No users found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* API Logs Tab */}
        {tab === "API Logs" && (
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-8 text-white overflow-hidden" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
              <p className="font-bold text-base sm:text-lg">📜 Recent API Logs</p>
              <button 
                onClick={() => fetchLogs(logsPage)}
                className="text-xs text-purple-200 hover:text-white transition"
                aria-label="Refresh logs"
              >
                🔄 Refresh
              </button>
            </div>
            
            {logsLoading ? (
              <div className="py-12 text-center text-gray-400">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white mb-2"></div>
                <p>Loading logs...</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white border-opacity-10">
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Time</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200 hidden lg:table-cell">API Key</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200 hidden md:table-cell">User</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Endpoint</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Status</th>
                        <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200 hidden sm:table-cell">Time (ms)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length > 0 ? (
                        logs.map((log) => (
                          <tr key={log.id} className="border-b border-white border-opacity-10 hover:bg-white hover:bg-opacity-10 transition">
                            <td className="py-2 sm:py-3 px-2 sm:px-4 whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleTimeString()}
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 font-mono text-gray-300 text-xs hidden lg:table-cell">
                              {log.apiKey?.key?.slice(0, 8)}...
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-gray-300 hidden md:table-cell">
                              {log.user?.businessName || 'Unknown'}
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 font-mono text-purple-200 text-xs break-all">
                              {log.endpoint}
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4">
                              <span className={`px-1 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                                log.statusCode >= 200 && log.statusCode < 300
                                  ? 'bg-green-500 bg-opacity-20 text-green-200'
                                  : log.statusCode === 429
                                  ? 'bg-yellow-500 bg-opacity-20 text-yellow-200'
                                  : 'bg-red-500 bg-opacity-20 text-red-200'
                              }`}>
                                {log.statusCode}
                              </span>
                            </td>
                            <td className="py-2 sm:py-3 px-2 sm:px-4 text-gray-300 hidden sm:table-cell">
                              {log.responseTime}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-gray-400">No logs found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                {logsTotal > 50 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <button
                      onClick={() => fetchLogs(logsPage - 1)}
                      disabled={logsPage === 1}
                      className="px-3 py-1 glass-card rounded-lg text-sm disabled:opacity-50 hover:bg-white hover:bg-opacity-10 transition"
                      aria-label="Previous page"
                    >
                      ← Previous
                    </button>
                    <span className="px-3 py-1 text-sm">
                      Page {logsPage} of {Math.ceil(logsTotal / 50)}
                    </span>
                    <button
                      onClick={() => fetchLogs(logsPage + 1)}
                      disabled={logsPage >= Math.ceil(logsTotal / 50)}
                      className="px-3 py-1 glass-card rounded-lg text-sm disabled:opacity-50 hover:bg-white hover:bg-opacity-10 transition"
                      aria-label="Next page"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Data Browser Tab */}
        {tab === "Data Browser" && (
          <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-8 text-white" style={{ animation: 'slideUp 0.6s ease-out' }}>
            <p className="font-bold text-base sm:text-lg mb-4">🗺️ Village Data Browser</p>
            
            {error && (
              <div className="text-red-300 text-sm mb-4 glass-card rounded-lg p-3" role="alert">
                ⚠️ Error: {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="glass-card rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                aria-label="Select state"
              >
                <option className="bg-gray-900" value="">Select state... {states.length > 0 && `(${states.length})`}</option>
                {states.map(s => (
                  <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
                ))}
              </select>
              
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                disabled={!selectedState}
                className="glass-card rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50"
                aria-label="Select district"
              >
                <option className="bg-gray-900" value="">Select district... {selectedState && districts.length > 0 && `(${districts.length})`}</option>
                {districts.map(d => (
                  <option key={d.id} value={d.id} className="bg-gray-900">{d.name}</option>
                ))}
              </select>
              
              <select
                value={selectedSubDistrict}
                onChange={(e) => setSelectedSubDistrict(e.target.value)}
                disabled={!selectedDistrict}
                className="glass-card rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50"
                aria-label="Select sub-district"
              >
                <option className="bg-gray-900" value="">Select sub-district... {selectedDistrict && subDistricts.length > 0 && `(${subDistricts.length})`}</option>
                {subDistricts.map(s => (
                  <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
                ))}
              </select>
            </div>
            
            {loading && (
              <div className="text-gray-300 text-sm mb-4 text-center py-8" role="status">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-2"></div>
                Loading villages...
              </div>
            )}
            
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="sticky top-0 glass-card">
                  <tr className="border-b border-white border-opacity-10">
                    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Code</th>
                    <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-200">Village Name</th>
                  </tr>
                </thead>
                <tbody>
                  {villages.length > 0 ? (
                    villages.map((v, i) => (
                      <tr key={i} className="border-b border-white border-opacity-10 hover:bg-white hover:bg-opacity-10 transition">
                        <td className="py-2 px-2 sm:px-4 font-mono text-gray-300 text-xs">{v.code}</td>
                        <td className="py-2 px-2 sm:px-4">{v.name}</td>
                      </tr>
                    ))
                  ) : (
                    !loading && (
                      <tr>
                        <td colSpan="2" className="py-12 text-center text-gray-400 text-sm">
                          {selectedSubDistrict ? 'No villages found for this sub-district' : 'Select a sub-district to view villages'}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            
            {villages.length > 0 && (
              <div className="text-center text-gray-400 text-xs mt-4">
                Showing {villages.length} villages
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}