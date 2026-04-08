import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from "recharts";

const COLORS = ["#378ADD", "#1D9E75", "#D85A30", "#BA7517"];

const requestsData = Array.from({ length: 30 }, (_, i) => ({
  date: `Apr ${i + 1}`,
  requests: Math.floor(Math.random() * 80000 + 20000),
}));

const statesData = [
  { state: "Uttar Pradesh", villages: 107106 },
  { state: "Madhya Pradesh", villages: 55065 },
  { state: "Odisha", villages: 51476 },
  { state: "Bihar", villages: 44937 },
  { state: "Rajasthan", villages: 44796 },
  { state: "Maharashtra", villages: 43946 },
].sort((a, b) => b.villages - a.villages);

const planData = [
  { name: "Free", value: 1240 },
  { name: "Premium", value: 430 },
  { name: "Pro", value: 185 },
  { name: "Unlimited", value: 42 },
];

const recentLogs = [
  { time: "14:32:01", key: "ak_****ab12", user: "Flipkart Inc.", endpoint: "/v1/search", ms: 43, status: 200 },
  { time: "14:31:58", key: "ak_****cd34", user: "Razorpay Ltd.", endpoint: "/v1/states/27/districts", ms: 21, status: 200 },
  { time: "14:31:55", key: "ak_****ef56", user: "Zomato Pvt.", endpoint: "/v1/autocomplete", ms: 18, status: 200 },
  { time: "14:31:50", key: "ak_****gh78", user: "Urban Clap.", endpoint: "/v1/search", ms: 67, status: 200 },
  { time: "14:31:44", key: "ak_****ij90", user: "OYO Rooms.", endpoint: "/v1/subdistricts/99/villages", ms: 312, status: 429 },
];

function Badge({ label, type = "info" }) {
  const colors = {
    info: { bg: "#E6F1FB", text: "#042C53" },
    success: { bg: "#E1F5EE", text: "#04342C" },
    warning: { bg: "#FAEEDA", text: "#412402" },
    danger: { bg: "#FCEBEB", text: "#501313" },
  };
  const c = colors[type] || colors.info;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>
      {label}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "white", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", ...style }}>
      {children}
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "1rem", flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 500, margin: 0, color }}>{value}</p>
    </div>
  );
}

const TABS = ["Overview", "API Logs", "Users", "Data Browser"];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#111", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Admin Panel</h2>
          <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>All India Villages API · Last updated just now</p>
        </div>
        <Badge label="● Live" type="success" />
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid #e0e0e0", marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: activeTab === t ? 500 : 400,
            color: activeTab === t ? "#111" : "#666",
            padding: "8px 16px",
            borderBottom: activeTab === t ? "2px solid #111" : "2px solid transparent",
            marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <MetricCard label="Total villages" value="6,19,225" color="#378ADD" />
            <MetricCard label="Active users" value="1,897" color="#1D9E75" />
            <MetricCard label="Today's requests" value="2.4M" color="#D85A30" />
            <MetricCard label="Avg response time" value="47ms" color="#BA7517" />
          </div>

          <Card>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>API requests — last 30 days</p>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={requestsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [v.toLocaleString(), "Requests"]} />
                  <Area type="monotone" dataKey="requests" stroke="#378ADD" strokeWidth={2} fill="#E6F1FB" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <Card>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Top states by village count</p>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statesData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="state" width={100} tick={{ fontSize: 11 }} axisLine={false} />
                    <Tooltip formatter={(v) => [v.toLocaleString(), "Villages"]} />
                    <Bar dataKey="villages" fill="#378ADD" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Users by plan type</p>
              <div style={{ height: 240, display: "flex", alignItems: "center" }}>
                <ResponsiveContainer width="60%" height="100%">
                  <PieChart>
                    <Pie data={planData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                      {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [v, "users"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {planData.map((p, i) => (
                    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i], flexShrink: 0 }} />
                      <span style={{ color: "#666", flex: 1 }}>{p.name}</span>
                      <span style={{ fontWeight: 500 }}>{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "API Logs" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Recent API logs</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                {["Time", "API Key", "User", "Endpoint", "ms", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((l, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{l.time}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#666" }}>{l.key}</td>
                  <td style={{ padding: "8px 10px" }}>{l.user}</td>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#378ADD" }}>{l.endpoint}</td>
                  <td style={{ padding: "8px 10px" }}>{l.ms}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <Badge label={l.status} type={l.status === 200 ? "success" : l.status === 429 ? "warning" : "danger"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === "Users" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Registered users</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                {["Business", "Email", "Plan", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Flipkart Inc.", email: "api@flipkart.com", plan: "Unlimited", status: "Active" },
                { name: "Razorpay Ltd.", email: "dev@razorpay.com", plan: "Pro", status: "Active" },
                { name: "Meesho Pvt.", email: "api@meesho.com", plan: "Pro", status: "Pending" },
              ].map((u, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                  <td style={{ padding: "10px 10px", fontWeight: 500 }}>{u.name}</td>
                  <td style={{ padding: "10px 10px", color: "#666" }}>{u.email}</td>
                  <td style={{ padding: "10px 10px" }}><Badge label={u.plan} type="info" /></td>
                  <td style={{ padding: "10px 10px" }}><Badge label={u.status} type={u.status === "Active" ? "success" : "warning"} /></td>
                  <td style={{ padding: "10px 10px" }}>
                    <button style={{ fontSize: 12, padding: "3px 10px", border: "0.5px solid #ccc", borderRadius: 6, background: "none", cursor: "pointer" }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === "Data Browser" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Village data browser</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <select style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc" }}>
              <option>Select state...</option>
              <option>Maharashtra</option>
              <option>Uttar Pradesh</option>
            </select>
            <select style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc" }}>
              <option>Select district...</option>
              <option>Nandurbar</option>
            </select>
            <input placeholder="Search village..." style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc", flex: 1 }} />
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                {["State", "District", "Sub-district", "Village code", "Village name"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Maharashtra", "Nandurbar", "Akkalkuwa", "525002", "Manibeli"],
                ["Maharashtra", "Nandurbar", "Akkalkuwa", "525003", "Dhankhedi"],
                ["Maharashtra", "Nandurbar", "Akkalkuwa", "525004", "Chimalkhadi"],
                ["Maharashtra", "Nandurbar", "Akkalkuwa", "525005", "Sinduri"],
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: "8px 10px", fontFamily: j === 3 ? "monospace" : "inherit", fontSize: j === 3 ? 12 : 13 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}