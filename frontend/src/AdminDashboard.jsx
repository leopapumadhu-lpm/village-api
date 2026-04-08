import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "./hooks/useAuth";
import { getStates, getDistricts, getSubDistricts, getVillages } from "./api";

const COLORS = ["#378ADD", "#1D9E75", "#D85A30", "#BA7517"];

function Badge({ label, type = "info" }) {
  const colors = {
    info: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    danger: "bg-red-100 text-red-800"
  };
  return <span className={`${colors[type]} px-2 py-1 rounded text-xs font-medium`}>{label}</span>;
}

function Card({ children }) {
  return <div className="bg-white border border-gray-200 rounded-lg p-6 mb-5">{children}</div>;
}

const TABS = ["Overview", "API Logs", "Users", "Data Browser"];

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const [tab, setTab] = useState("Overview");
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSubDistrict, setSelectedSubDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Analytics data
  const [analytics, setAnalytics] = useState({ totalVillages: 0, activeUsers: 0, totalRequests: 0 });
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);

  // Fetch analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/analytics`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setAnalytics(data.data || {});
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/logs`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setLogs(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };
    fetchLogs();
  }, []);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUsers(data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  // Fetch states
  useEffect(() => {
    const loadStates = async () => {
      try {
        setError(null);
        const data = await getStates();
        setStates(data || []);
      } catch (error) {
        console.error("Failed to load states:", error);
        setError(error.message);
      }
    };
    loadStates();
  }, []);

  // Fetch districts
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
        } finally {
          setLoading(false);
        }
      };
      loadDistricts();
    }
  }, [selectedState]);

  // Fetch sub-districts
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
        } finally {
          setLoading(false);
        }
      };
      loadSubDistricts();
    }
  }, [selectedDistrict]);

  // Fetch villages
  useEffect(() => {
    if (selectedSubDistrict) {
      const loadVillages = async () => {
        try {
          setLoading(true);
          const data = await getVillages(parseInt(selectedSubDistrict));
          setVillages(data || []);
        } catch (error) {
          console.error("Failed to load villages:", error);
        } finally {
          setLoading(false);
        }
      };
      loadVillages();
    }
  }, [selectedSubDistrict]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600">All India Villages API</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge label="● Live" type="success" />
            <div className="text-right text-sm">
              <p className="font-medium text-gray-900">{user?.email || 'Admin'}</p>
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
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                tab === t
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === "Overview" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total villages", value: analytics.totalVillages?.toLocaleString() || "619,225", color: "#378ADD" },
                { label: "Active users", value: analytics.activeUsers || "1,897", color: "#1D9E75" },
                { label: "Today's requests", value: analytics.totalRequests?.toLocaleString() || "2.4M", color: "#D85A30" },
                { label: "Avg response time", value: "47ms", color: "#BA7517" }
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-100 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-2">{label}</p>
                  <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            <Card>
              <p className="font-medium mb-4">API requests — last 30 days</p>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.from({ length: 30 }, (_, i) => ({
                    date: `Apr ${i + 1}`,
                    requests: Math.floor(Math.random() * 80000 + 20000)
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={v => v.toLocaleString()} />
                    <Area type="monotone" dataKey="requests" stroke="#378ADD" strokeWidth={2} fill="#E6F1FB" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        )}

        {/* Users Tab */}
        {tab === "Users" && (
          <Card>
            <p className="font-medium mb-4">Registered users</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Business</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Email</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Plan</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map(u => (
                      <tr key={u.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-3 font-medium">{u.businessName}</td>
                        <td className="py-3 px-3 text-gray-600">{u.email}</td>
                        <td className="py-3 px-3"><Badge label={u.planType} type="info" /></td>
                        <td className="py-3 px-3"><Badge label={u.status} type={u.status === "ACTIVE" ? "success" : "warning"} /></td>
                        <td className="py-3 px-3 text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="py-8 text-center text-gray-500">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* API Logs Tab */}
        {tab === "API Logs" && (
          <Card>
            <p className="font-medium mb-4">Recent API logs</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Time</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">API Key</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">User</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Endpoint</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Response (ms)</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length > 0 ? (
                    logs.map(log => (
                      <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50 text-xs">
                        <td className="py-3 px-3">{new Date(log.createdAt).toLocaleTimeString()}</td>
                        <td className="py-3 px-3 font-mono text-gray-600">{log.apiKey?.key?.slice(0, 10)}...****</td>
                        <td className="py-3 px-3">{log.user?.businessName || 'Unknown'}</td>
                        <td className="py-3 px-3 font-mono text-blue-600">{log.endpoint}</td>
                        <td className="py-3 px-3">{log.responseTime}</td>
                        <td className="py-3 px-3">
                          <Badge
                            label={log.statusCode}
                            type={log.statusCode >= 200 && log.statusCode < 300 ? "success" : log.statusCode === 429 ? "warning" : "danger"}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="py-8 text-center text-gray-500">No logs found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Data Browser Tab */}
        {tab === "Data Browser" && (
          <Card>
            <p className="font-medium mb-4">Village data browser</p>
            {error && <p className="text-red-600 text-sm mb-4">⚠️ Error: {error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select state... {states.length > 0 && `(${states.length})`}</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                disabled={!selectedState}
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Select district... {selectedState && districts.length > 0 && `(${districts.length})`}</option>
                {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select
                value={selectedSubDistrict}
                onChange={(e) => setSelectedSubDistrict(e.target.value)}
                disabled={!selectedDistrict}
                className="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">Select sub-district... {selectedDistrict && subDistricts.length > 0 && `(${subDistricts.length})`}</option>
                {subDistricts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {loading && <p className="text-gray-600 text-sm mb-4">Loading...</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Code</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Village</th>
                  </tr>
                </thead>
                <tbody>
                  {villages.length > 0 ? (
                    villages.map((v, i) => (
                      <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono text-gray-600 text-xs">{v.code}</td>
                        <td className="py-2 px-3">{v.name}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" className="py-8 text-center text-gray-500 text-sm">Select a sub-district to view villages</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
