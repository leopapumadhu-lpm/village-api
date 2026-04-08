import { useState, useEffect } from "react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getStates, getDistricts, getSubDistricts, getVillages, searchVillages } from "./api";

const COLORS = ["#378ADD", "#1D9E75", "#D85A30", "#BA7517"];
const requestsData = Array.from({ length: 30 }, (_, i) => ({ date: `Apr ${i + 1}`, requests: Math.floor(Math.random() * 80000 + 20000) }));
const statesData = [{ state: "Uttar Pradesh", villages: 107106 }, { state: "Madhya Pradesh", villages: 55065 }, { state: "Odisha", villages: 51476 }, { state: "Bihar", villages: 44937 }, { state: "Rajasthan", villages: 44796 }, { state: "Maharashtra", villages: 43946 }];
const planData = [{ name: "Free", value: 1240 }, { name: "Premium", value: 430 }, { name: "Pro", value: 185 }, { name: "Unlimited", value: 42 }];
const recentLogs = [{ time: "14:32:01", key: "ak_****ab12", user: "Flipkart Inc.", endpoint: "/v1/search", ms: 43, status: 200 }, { time: "14:31:58", key: "ak_****cd34", user: "Razorpay Ltd.", endpoint: "/v1/states/27/districts", ms: 21, status: 200 }, { time: "14:31:44", key: "ak_****ij90", user: "OYO Rooms.", endpoint: "/v1/subdistricts/99/villages", ms: 312, status: 429 }];

function Badge({ label, type = "info" }) {
  const c = { info: ["#E6F1FB","#042C53"], success: ["#E1F5EE","#04342C"], warning: ["#FAEEDA","#412402"], danger: ["#FCEBEB","#501313"] }[type] || ["#E6F1FB","#042C53"];
  return <span style={{ background: c[0], color: c[1], fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>{label}</span>;
}

function Card({ children }) {
  return <div style={{ background: "white", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>{children}</div>;
}

const TABS = ["Overview", "API Logs", "Users", "Data Browser"];

export default function AdminDashboard() {
  const [tab, setTab] = useState("Overview");
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [subDistricts, setSubDistricts] = useState([]);
  const [villages, setVillages] = useState([]);
  const [selectedState, setSelectedState] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedSubDistrict, setSelectedSubDistrict] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadStates = async () => {
      try {
        const data = await getStates();
        setStates(data || []);
      } catch (error) {
        console.error("Failed to load states:", error);
      }
    };
    loadStates();
  }, []);

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
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#111", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div><h2 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Admin Panel</h2><p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>All India Villages API</p></div>
        <Badge label="● Live" type="success" />
      </div>
      <div style={{ display: "flex", gap: 4, borderBottom: "0.5px solid #e0e0e0", marginBottom: "1.5rem" }}>
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: tab === t ? 500 : 400, color: tab === t ? "#111" : "#666", padding: "8px 16px", borderBottom: tab === t ? "2px solid #111" : "2px solid transparent", marginBottom: -1 }}>{t}</button>)}
      </div>

      {tab === "Overview" && (
        <div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "1.25rem" }}>
            {[["Total villages","6,19,225","#378ADD"],["Active users","1,897","#1D9E75"],["Today's requests","2.4M","#D85A30"],["Avg response time","47ms","#BA7517"]].map(([label,value,color]) => (
              <div key={label} style={{ background: "#f5f5f5", borderRadius: 8, padding: "1rem", flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, color: "#666", margin: "0 0 6px" }}>{label}</p>
                <p style={{ fontSize: 26, fontWeight: 500, margin: 0, color }}>{value}</p>
              </div>
            ))}
          </div>
          <Card>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>API requests — last 30 days</p>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={requestsData}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} interval={4} /><YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} /><Tooltip formatter={v => [v.toLocaleString(),"Requests"]} /><Area type="monotone" dataKey="requests" stroke="#378ADD" strokeWidth={2} fill="#E6F1FB" /></AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            <Card>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Top states by village count</p>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statesData} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} /><YAxis type="category" dataKey="state" width={110} tick={{ fontSize: 11 }} axisLine={false} /><Tooltip formatter={v => [v.toLocaleString(),"Villages"]} /><Bar dataKey="villages" fill="#378ADD" radius={[0,4,4,0]} barSize={16} /></BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Users by plan</p>
              <div style={{ height: 220, display: "flex", alignItems: "center" }}>
                <ResponsiveContainer width="60%" height="100%">
                  <PieChart><Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3}>{planData.map((_,i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip formatter={v => [v,"users"]} /></PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  {planData.map((p,i) => <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i], flexShrink: 0 }} /><span style={{ color: "#666", flex: 1 }}>{p.name}</span><span style={{ fontWeight: 500 }}>{p.value}</span></div>)}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "API Logs" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Recent API logs</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>{["Time","API Key","User","Endpoint","ms","Status"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>{recentLogs.map((l,i) => <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}><td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{l.time}</td><td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#666" }}>{l.key}</td><td style={{ padding: "8px 10px" }}>{l.user}</td><td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#378ADD" }}>{l.endpoint}</td><td style={{ padding: "8px 10px" }}>{l.ms}</td><td style={{ padding: "8px 10px" }}><Badge label={l.status} type={l.status===200?"success":l.status===429?"warning":"danger"} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === "Users" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Registered users</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>{["Business","Email","Plan","Status"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>{[["Flipkart Inc.","api@flipkart.com","Unlimited","Active"],["Razorpay Ltd.","dev@razorpay.com","Pro","Active"],["Meesho Pvt.","api@meesho.com","Pro","Pending"]].map(([name,email,plan,status],i) => <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}><td style={{ padding: "10px", fontWeight: 500 }}>{name}</td><td style={{ padding: "10px", color: "#666" }}>{email}</td><td style={{ padding: "10px" }}><Badge label={plan} type="info" /></td><td style={{ padding: "10px" }}><Badge label={status} type={status==="Active"?"success":"warning"} /></td></tr>)}</tbody>
          </table>
        </Card>
      )}

      {tab === "Data Browser" && (
        <Card>
          <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 16px" }}>Village data browser</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc" }}>
              <option value="">Select state...</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              disabled={!selectedState}
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc", opacity: !selectedState ? 0.5 : 1 }}>
              <option value="">Select district...</option>
              {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select
              value={selectedSubDistrict}
              onChange={(e) => setSelectedSubDistrict(e.target.value)}
              disabled={!selectedDistrict}
              style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8, border: "0.5px solid #ccc", opacity: !selectedDistrict ? 0.5 : 1 }}>
              <option value="">Select sub-district...</option>
              {subDistricts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {loading && <p style={{ color: "#666", fontSize: 13 }}>Loading...</p>}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ borderBottom: "0.5px solid #e0e0e0" }}>{["Code", "Village"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500, color: "#666", fontSize: 11 }}>{h}</th>)}</tr></thead>
            <tbody>
              {villages.length > 0 ? (
                villages.map((v, i) => <tr key={i} style={{ borderBottom: "0.5px solid #e0e0e0" }}>
                  <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12 }}>{v.code}</td>
                  <td style={{ padding: "8px 10px" }}>{v.name}</td>
                </tr>)
              ) : (
                <tr><td colSpan="2" style={{ padding: "16px", textAlign: "center", color: "#999" }}>Select a sub-district to view villages</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
