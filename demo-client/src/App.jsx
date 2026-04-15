import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
const API_KEY = import.meta.env.VITE_API_KEY || 'demo-key-with-daily-limit'

const glassStyle = `
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
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
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: white;
  }
  .glass-input::placeholder {
    color: rgba(255, 255, 255, 0.7);
  }
  .glass-input:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.15);
  }
  .gradient-bg {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  }
`

export default function App() {
  const [village, setVillage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedData, setSelectedData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleVillageSearch = async (query) => {
    setVillage(query)
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `${API_URL}/v1/autocomplete?q=${encodeURIComponent(query)}`,
        {
          headers: { 'X-API-Key': API_KEY }
        }
      )
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.data || [])
      } else {
        setError('Failed to fetch suggestions')
      }
    } catch (err) {
      setError('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectVillage = async (villageData) => {
    setVillage(villageData.label)
    setSuggestions([])
    setSelectedData(villageData)
  }

  return (
    <div className="min-h-screen gradient-bg overflow-hidden">
      <style>{glassStyle}</style>

      {/* Animated background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-300 rounded-full blur-3xl opacity-10 animate-pulse"></div>
      </div>

      {/* Header */}
      <header className="glass-card border-b backdrop-blur-md sticky top-0 z-40" style={{ animation: 'slideDown 0.6s ease-out' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-5xl">🏘️</div>
            <div>
              <h1 className="text-4xl font-bold text-white">Village API Demo</h1>
              <p className="text-gray-200 text-sm">Explore 619,225 villages across India with intelligent autocomplete</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        <div className="glass-card rounded-3xl backdrop-blur-md p-8 mb-8" style={{ animation: 'slideUp 0.6s ease-out' }}>
          {/* Search Form */}
          <div className="mb-8">
            <label className="block text-sm font-bold text-white mb-4">
              ✨ Find Your Village
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Type village name (e.g., Mumbai, Bangalore, Delhi...)"
                value={village}
                onChange={(e) => handleVillageSearch(e.target.value)}
                className="glass-input w-full px-6 py-4 rounded-2xl text-white text-lg"
              />
              {loading && (
                <div className="absolute right-4 top-4">
                  <div className="animate-spin text-purple-300 text-2xl">⟳</div>
                </div>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute z-20 w-full mt-3 max-w-full glass-card rounded-2xl backdrop-blur-md border-2 border-white border-opacity-20 overflow-hidden" style={{ animation: 'slideUp 0.3s ease-out' }}>
                <div className="max-h-80 overflow-y-auto">
                  {suggestions.slice(0, 10).map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectVillage(suggestion)}
                      className="w-full text-left px-6 py-4 hover:bg-white hover:bg-opacity-10 border-b border-white border-opacity-10 last:border-b-0 transition text-white"
                    >
                      <div className="font-semibold text-lg">{suggestion.label}</div>
                      <div className="text-xs text-gray-300 mt-1">
                        {suggestion.sublabel}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 p-4 glass-card rounded-2xl border-2 border-red-400 text-red-100 text-sm" style={{ animation: 'slideUp 0.3s ease-out' }}>
                ⚠️ {error}
              </div>
            )}
          </div>

          {/* Selected Village Details */}
          {selectedData && (
            <div className="glass-card rounded-2xl p-8 border-2 border-green-400 border-opacity-50 text-white" style={{ animation: 'slideUp 0.4s ease-out' }}>
              <h2 className="text-2xl font-bold mb-6">📍 Selected Location</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-1 uppercase tracking-wider">🏘️ Village</p>
                    <p className="text-2xl font-bold text-white">{selectedData.label}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-1 uppercase tracking-wider">📍 Location</p>
                    <p className="text-lg text-gray-200">{selectedData.sublabel}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-300 mb-1 uppercase tracking-wider">🌏 State</p>
                    <p className="text-lg text-gray-200">{selectedData.state}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Demo CTA */}
          {!selectedData && (
            <div className="glass-card rounded-2xl p-12 text-center text-white" style={{ animation: 'slideUp 0.4s ease-out' }}>
              <p className="text-2xl font-semibold mb-4">🔍 Start typing to explore villages!</p>
              <p className="text-sm text-gray-300 mb-4">
                Try one of these:
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <code className="glass-card rounded-lg px-4 py-2 text-sm font-mono">Mumbai</code>
                <code className="glass-card rounded-lg px-4 py-2 text-sm font-mono">Bangalore</code>
                <code className="glass-card rounded-lg px-4 py-2 text-sm font-mono">Delhi</code>
              </div>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { icon: '📊', value: '619,225', label: 'Villages Indexed' },
            { icon: '⚡', value: '< 100ms', label: 'Response Time' },
            { icon: '🔒', value: 'Secure', label: 'API Key Protected' }
          ].map((item, i) => (
            <div key={i} className="glass-card rounded-2xl p-8 text-center text-white hover:scale-105 transition" style={{ animation: `slideUp 0.6s ease-out ${0.3 + i * 0.1}s backwards` }}>
              <p className="text-5xl mb-3">{item.icon}</p>
              <p className="font-bold text-2xl mb-1">{item.value}</p>
              <p className="text-sm text-gray-300">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-gray-300 text-sm mb-4">Built with 💜 using Village API</p>
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card rounded-xl px-6 py-3 text-white font-semibold hover:bg-white hover:bg-opacity-20 transition inline-block"
          >
            View B2B Dashboard →
          </a>
        </div>
      </div>
    </div>
  )
}
