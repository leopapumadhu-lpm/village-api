import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function B2BDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  const token = localStorage.getItem('authToken');

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setDashboardData(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard:', err);
      }
    };
    fetchDashboard();
  }, [token]);

  // Fetch API keys
  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/apikeys`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setApiKeys(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch API keys:', err);
      }
    };
    fetchKeys();
  }, [token]);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/apikeys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newKeyName })
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedKey(data.data);
        setNewKeyName('');
        setShowCreateForm(false);
        // Refresh keys
        const keysResponse = await fetch(`${import.meta.env.VITE_API_URL}/b2b/apikeys`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (keysResponse.ok) {
          const keysData = await keysResponse.json();
          setApiKeys(keysData.data || []);
        }
      } else {
        const errData = await response.json();
        setError(errData.error || 'Failed to create key');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!confirm('Revoke this API key? It will stop working immediately.')) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/b2b/apikeys/${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== keyId));
      } else {
        setError('Failed to revoke key');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCopyToClipboard = (text, keyId) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  if (!dashboardData) {
    return <div className="flex items-center justify-center h-screen text-gray-600">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">B2B Portal</h1>
            <p className="text-sm text-gray-600">{user?.businessName || 'Business Dashboard'}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-medium text-gray-900">{user?.email}</p>
              <button
                onClick={logout}
                className="text-blue-600 hover:text-blue-800 text-xs mt-1"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'apikeys', label: 'API Keys' },
            { id: 'docs', label: 'Documentation' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Plan', value: dashboardData.plan, icon: '📊' },
                { label: 'Today\'s Usage', value: `${dashboardData.todayUsage}/${dashboardData.dailyLimit}`, icon: '📈' },
                { label: 'Avg Response Time', value: `${dashboardData.avgResponseTime}ms`, icon: '⚡' },
                { label: 'Success Rate', value: `${dashboardData.successRate}%`, icon: '✅' }
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-2xl mb-2">{icon}</p>
                  <p className="text-xs text-gray-600 mb-1">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Usage Chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold mb-4">Last 7 Days Usage</h3>
              <div style={{ height: 250 }}>
                {dashboardData.chartData && dashboardData.chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboardData.chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500 text-center py-12">No usage data yet</p>
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'API Documentation', icon: '📚', color: 'bg-blue-50 border-blue-200 text-blue-600' },
                { label: 'Support & Chat', icon: '💬', color: 'bg-green-50 border-green-200 text-green-600' },
                { label: 'API Status', icon: '🔍', color: 'bg-purple-50 border-purple-200 text-purple-600' }
              ].map(({ label, icon, color }) => (
                <button
                  key={label}
                  className={`border-2 rounded-lg p-4 text-left font-medium ${color} hover:shadow-md transition`}
                >
                  <p className="text-2xl mb-2">{icon}</p>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {tab === 'apikeys' && (
          <div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                {error}
              </div>
            )}

            {createdKey && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded">
                <h3 className="font-semibold text-green-900 mb-3">✅ API Key Created!</h3>
                <div className="space-y-3 font-mono text-sm">
                  <div>
                    <p className="text-green-700 text-xs mb-1">API Key:</p>
                    <div className="flex gap-2">
                      <code className="bg-white border border-green-200 px-3 py-2 rounded flex-1 break-all">
                        {createdKey.key}
                      </code>
                      <button
                        onClick={() => handleCopyToClipboard(createdKey.key, 'key')}
                        className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700"
                      >
                        {copiedKeyId === 'key' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-green-700 text-xs mb-1">Secret (shown only once):</p>
                    <div className="flex gap-2">
                      <code className="bg-white border border-green-200 px-3 py-2 rounded flex-1 break-all">
                        {createdKey.secret}
                      </code>
                      <button
                        onClick={() => handleCopyToClipboard(createdKey.secret, 'secret')}
                        className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700"
                      >
                        {copiedKeyId === 'secret' ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-yellow-700 text-xs mt-3">⚠️ {createdKey.warning}</p>
                <button
                  onClick={() => setCreatedKey(null)}
                  className="mt-3 text-green-600 hover:text-green-800 text-sm font-medium"
                >
                  Done
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Your API Keys</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
              >
                + Create New Key
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateKey} className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Key Name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g., Production Server, Staging, Mobile App"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm"
                  >
                    {loading ? 'Creating...' : 'Create Key'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* API Keys List */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {apiKeys.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-3 px-4 font-medium text-gray-700 text-sm">Key Name</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 text-sm">API Key</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 text-sm">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 text-sm">Last Used</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-700 text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(key => (
                      <tr key={key.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium text-gray-900">{key.name}</td>
                        <td className="py-3 px-4 font-mono text-sm text-gray-600">{key.key}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            key.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {key.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <button
                            onClick={() => handleCopyToClipboard(key.key, key.id)}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            {copiedKeyId === key.id ? '✓ Copied' : 'Copy'}
                          </button>
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No API keys yet. Create one to get started!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documentation Tab */}
        {tab === 'docs' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold mb-4">API Documentation</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Base URL</h3>
                <code className="bg-gray-100 p-2 rounded block">{import.meta.env.VITE_API_URL}/v1</code>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Authentication</h3>
                <p className="text-gray-600 text-sm mb-2">All requests require your API key in the header:</p>
                <code className="bg-gray-100 p-2 rounded block text-sm">X-API-Key: your_api_key_here</code>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Popular Endpoints</h3>
                <div className="space-y-2 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <code className="text-blue-600">GET /states</code>
                    <p className="text-gray-600">List all Indian states</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <code className="text-blue-600">GET /states/{`{id}`}/districts</code>
                    <p className="text-gray-600">Get districts for a state</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <code className="text-blue-600">GET /search?q=village_name</code>
                    <p className="text-gray-600">Search for villages</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <code className="text-blue-600">GET /autocomplete?q=query</code>
                    <p className="text-gray-600">Get autocomplete suggestions</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Example Request</h3>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl -H "X-API-Key: YOUR_API_KEY" \\
  "${import.meta.env.VITE_API_URL}/v1/states"`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
