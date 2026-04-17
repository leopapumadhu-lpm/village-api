import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_API_KEY || 'ak_demo123456789012345678901234'

// Glassmorphism styles
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  
  * {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
  
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-20px); }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  .animate-float {
    animation: float 6s ease-in-out infinite;
  }
  
  .animate-float-delayed {
    animation: float 6s ease-in-out infinite;
    animation-delay: 3s;
  }
  
  .glass-card {
    backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
  }
  
  .glass-card:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
    box-shadow: 0 12px 40px 0 rgba(31, 38, 135, 0.45);
  }
  
  .glass-input {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: white;
    transition: all 0.3s ease;
  }
  
  .glass-input::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }
  
  .glass-input:focus {
    outline: none;
    border-color: rgba(102, 126, 234, 0.8);
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.2);
  }
  
  .gradient-bg {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
    background-size: 400% 400%;
    animation: gradientShift 15s ease infinite;
  }
  
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  .stat-card {
    backdrop-filter: blur(20px);
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .btn-primary {
    background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%);
    color: #764ba2;
    font-weight: 600;
    transition: all 0.3s ease;
  }
  
  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.9) 100%);
  }
  
  .suggestion-item {
    transition: all 0.2s ease;
    border-left: 3px solid transparent;
  }
  
  .suggestion-item:hover {
    background: rgba(102, 126, 234, 0.2);
    border-left-color: #667eea;
    padding-left: 1.5rem;
  }
  
  .loading-spinner {
    border: 3px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .tag {
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    transition: all 0.2s ease;
  }
  
  .tag:hover {
    background: rgba(255,255,255,0.25);
    transform: scale(1.05);
    cursor: pointer;
  }
`

export default function App() {
  const [village, setVillage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedData, setSelectedData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serverStatus, setServerStatus] = useState('checking')

  // Check server health on mount
  useEffect(() => {
    checkServerHealth()
  }, [])

  const checkServerHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      if (response.ok) {
        setServerStatus('online')
      } else {
        setServerStatus('offline')
      }
    } catch (err) {
      setServerStatus('offline')
    }
  }

  const handleVillageSearch = async (query) => {
    setVillage(query)
    setError('')
    
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `${API_URL}/v1/autocomplete?q=${encodeURIComponent(query)}`,
        {
          headers: { 
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      setSuggestions(data.data || [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError(`Unable to connect to API. Make sure the server is running at ${API_URL}`)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVillage = async (villageData) => {
    setVillage(villageData.label)
    setSuggestions([])
    
    // Fetch full details
    try {
      const response = await fetch(
        `${API_URL}/v1/search?q=${encodeURIComponent(villageData.label)}&limit=1`,
        {
          headers: { 
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.data && data.data.length > 0) {
          setSelectedData(data.data[0])
        } else {
          setSelectedData(villageData)
        }
      } else {
        setSelectedData(villageData)
      }
    } catch (err) {
      setSelectedData(villageData)
    }
  }

  const quickSearch = (term) => {
    handleVillageSearch(term)
  }

  return (
    <div className="min-h-screen gradient-bg relative overflow-hidden">
      <style>{styles}</style>

      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-400 rounded-full blur-3xl opacity-20 animate-float"></div>
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-pink-400 rounded-full blur-3xl opacity-20 animate-float-delayed"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-400 rounded-full blur-3xl opacity-20 animate-float"></div>
      </div>

      {/* Navigation Bar */}
      <nav className="glass-card sticky top-0 z-50 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🏘️</div>
              <div>
                <h1 className="text-xl font-bold text-white">Village API</h1>
                <p className="text-xs text-white/60">Indian Villages Database</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${serverStatus === 'online' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                <span className="text-sm text-white/80">{serverStatus === 'online' ? 'Server Online' : 'Server Offline'}</span>
              </div>
              <a 
                href="http://localhost:3000/api-docs" 
                target="_blank"
                className="btn-primary px-4 py-2 rounded-lg text-sm"
              >
                API Docs
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-8 relative z-10">
        <div className="text-center mb-12" style={{ animation: 'slideDown 0.6s ease-out' }}>
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Discover <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-300">619K+</span> Indian Villages
          </h2>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Search across states, districts, and villages with lightning-fast autocomplete
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { value: '619,225', label: 'Villages', icon: '🏘️' },
            { value: '<100ms', label: 'Response', icon: '⚡' },
            { value: '99.9%', label: 'Uptime', icon: '📈' },
            { value: '5 States', label: 'Demo Data', icon: '🗺️' }
          ].map((stat, i) => (
            <div 
              key={i} 
              className="stat-card rounded-2xl p-6 text-center"
              style={{ animation: `slideUp 0.6s ease-out ${i * 0.1}s backwards` }}
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-white/60">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search Section */}
        <div 
          className="glass-card rounded-3xl p-8 mb-8"
          style={{ animation: 'slideUp 0.6s ease-out 0.3s backwards' }}
        >
          <div className="mb-6">
            <label className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <span className="text-2xl">✨</span>
              Find Your Village
            </label>
            
            <div className="relative">
              <input
                type="text"
                placeholder="Type village name (e.g., Chennai, Bangalore, Mumbai...)"
                value={village}
                onChange={(e) => handleVillageSearch(e.target.value)}
                className="glass-input w-full px-6 py-5 rounded-2xl text-white text-lg pr-14"
              />
              {loading && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2">
                  <div className="loading-spinner w-6 h-6"></div>
                </div>
              )}
              {!loading && village && (
                <button 
                  onClick={() => { setVillage(''); setSuggestions([]); setSelectedData(null); }}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && !selectedData && (
              <div 
                className="mt-3 glass-card rounded-2xl overflow-hidden max-h-80 overflow-y-auto"
                style={{ animation: 'slideUp 0.3s ease-out' }}
              >
                <div className="px-4 py-2 bg-white/5 text-white/60 text-sm border-b border-white/10">
                  {suggestions.length} result{suggestions.length !== 1 ? 's' : ''} found
                </div>
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelectVillage(suggestion)}
                    className="suggestion-item w-full text-left px-6 py-4 border-b border-white/10 last:border-b-0 text-white"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-lg">{suggestion.label}</div>
                        <div className="text-sm text-white/60 mt-1">Code: {suggestion.value}</div>
                      </div>
                      <span className="text-white/40">→</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div 
                className="mt-4 p-4 rounded-2xl bg-red-500/20 border border-red-400/50 text-white"
                style={{ animation: 'slideUp 0.3s ease-out' }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-medium">{error}</p>
                    <p className="text-sm text-white/70 mt-1">
                      Run: <code className="bg-black/30 px-2 py-1 rounded">cd village-api && npm start</code>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Tags */}
          {!village && !selectedData && (
            <div className="flex flex-wrap gap-2">
              <span className="text-white/60 text-sm mr-2">Try:</span>
              {['Chennai', 'Bangalore', 'Mumbai', 'Kochi', 'Kadiri'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => quickSearch(tag)}
                  className="tag px-4 py-2 rounded-full text-sm text-white"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Selected Village Details */}
          {selectedData && (
            <div 
              className="mt-6 glass-card rounded-2xl p-8 border-2 border-green-400/50"
              style={{ animation: 'slideUp 0.4s ease-out' }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  📍 Village Details
                </h3>
                <button 
                  onClick={() => { setSelectedData(null); setVillage(''); }}
                  className="text-white/60 hover:text-white text-sm"
                >
                  Clear ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-xs font-bold text-white/50 mb-1 uppercase tracking-wider">Village Name</p>
                    <p className="text-2xl font-bold text-white">{selectedData.label}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5">
                    <p className="text-xs font-bold text-white/50 mb-1 uppercase tracking-wider">Village Code</p>
                    <p className="text-lg font-mono text-white/90">{selectedData.value}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {selectedData.fullAddress && (
                    <div className="p-4 rounded-xl bg-white/5">
                      <p className="text-xs font-bold text-white/50 mb-1 uppercase tracking-wider">Full Address</p>
                      <p className="text-lg text-white/90 leading-relaxed">{selectedData.fullAddress}</p>
                    </div>
                  )}
                  {selectedData.hierarchy && (
                    <div className="p-4 rounded-xl bg-white/5">
                      <p className="text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">Hierarchy</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedData.hierarchy.state && (
                          <span className="px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 text-sm">
                            {selectedData.hierarchy.state}
                          </span>
                        )}
                        {selectedData.hierarchy.district && (
                          <span className="px-3 py-1 rounded-full bg-purple-500/30 text-purple-200 text-sm">
                            {selectedData.hierarchy.district}
                          </span>
                        )}
                        {selectedData.hierarchy.subDistrict && (
                          <span className="px-3 py-1 rounded-full bg-pink-500/30 text-pink-200 text-sm">
                            {selectedData.hierarchy.subDistrict}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* API Response Preview */}
              <div className="mt-6 p-4 rounded-xl bg-black/30 overflow-x-auto">
                <p className="text-xs font-bold text-white/50 mb-2 uppercase tracking-wider">API Response</p>
                <pre className="text-sm text-green-400 font-mono">
                  {JSON.stringify(selectedData, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { 
              icon: '🔍', 
              title: 'Smart Search', 
              desc: 'Fuzzy matching across 619K+ villages with instant results' 
            },
            { 
              icon: '🔐', 
              title: 'Secure API', 
              desc: 'API key authentication with rate limiting and JWT tokens' 
            },
            { 
              icon: '📊', 
              title: 'Rich Data', 
              desc: 'Complete hierarchy: State → District → Sub-district → Village' 
            }
          ].map((feature, i) => (
            <div 
              key={i} 
              className="glass-card rounded-2xl p-6 text-white"
              style={{ animation: `slideUp 0.6s ease-out ${0.4 + i * 0.1}s backwards` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
              <p className="text-white/70 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* API Endpoints */}
        <div 
          className="glass-card rounded-2xl p-6 mb-8"
          style={{ animation: 'slideUp 0.6s ease-out 0.7s backwards' }}
        >
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            📡 Available Endpoints
          </h3>
          <div className="space-y-2">
            {[
              { method: 'GET', path: '/v1/states', desc: 'List all states' },
              { method: 'GET', path: '/v1/search?q={query}', desc: 'Search villages' },
              { method: 'GET', path: '/v1/autocomplete?q={query}', desc: 'Autocomplete suggestions' },
            ].map((endpoint, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                <span className="px-2 py-1 rounded bg-green-500/30 text-green-300 text-xs font-mono font-bold">
                  {endpoint.method}
                </span>
                <code className="text-white/90 font-mono text-sm flex-1">{endpoint.path}</code>
                <span className="text-white/60 text-sm">{endpoint.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center pt-8 border-t border-white/10" style={{ animation: 'fadeIn 1s ease-out' }}>
          <p className="text-white/60 text-sm mb-2">
            Built with 💜 using <span className="text-white font-semibold">Village API</span>
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <a href="http://localhost:3000" className="text-white/80 hover:text-white transition">
              API Server
            </a>
            <span className="text-white/30">•</span>
            <a href="http://localhost:3000/api-docs" className="text-white/80 hover:text-white transition">
              Documentation
            </a>
            <span className="text-white/30">•</span>
            <a href="http://localhost:5173" className="text-white/80 hover:text-white transition">
              Dashboard
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
