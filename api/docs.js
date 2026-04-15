export function getDocsPage() {
  // Base URL for API endpoints (configurable via environment)
  const API_BASE_URL = process.env.API_BASE_URL || '';
  const ADMIN_DASHBOARD_URL = process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5173';
  const DEMO_CLIENT_URL = process.env.DEMO_CLIENT_URL || 'http://localhost:5174';
  const GITHUB_REPO_URL = process.env.GITHUB_REPO_URL || 'https://github.com/madhuvanthi/village-api';
  const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@villageapi.com';

  // Stats that can be updated dynamically
  const stats = {
    villages: process.env.TOTAL_VILLAGES || '619K+',
    responseTime: process.env.AVG_RESPONSE_TIME || '<100ms',
    uptime: process.env.UPTIME_PERCENTAGE || '99.9%',
    tiers: process.env.PRICING_TIERS || '4 Tiers',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Village API - Access 619,000+ Indian villages data with high-performance REST API">
  <meta name="keywords" content="API, Villages, India, Geographic Data, REST API">
  <meta name="author" content="Village API Team">
  <meta name="theme-color" content="#667eea">
  
  <!-- Open Graph / Social Media Meta Tags -->
  <meta property="og:title" content="Village API Documentation">
  <meta property="og:description" content="Access 619,000+ Indian villages data with our high-performance REST API">
  <meta property="og:type" content="website">
  <meta property="og:image" content="/api-og-image.png">
  <meta property="og:url" content="${API_BASE_URL}">
  
  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Village API Documentation">
  <meta name="twitter:description" content="Access 619,000+ Indian villages data with our high-performance REST API">
  
  <title>Village API Documentation - Indian Village Data API</title>
  
  <!-- Preload critical assets -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  <style>
    /* CSS Reset & Base Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    /* Custom Properties for Theming */
    :root {
      --primary-gradient-start: #667eea;
      --primary-gradient-end: #764ba2;
      --glass-bg: rgba(255, 255, 255, 0.1);
      --glass-border: rgba(255, 255, 255, 0.2);
      --glass-hover-bg: rgba(255, 255, 255, 0.15);
      --glass-hover-border: rgba(255, 255, 255, 0.4);
      --text-primary: #ffffff;
      --text-secondary: rgba(255, 255, 255, 0.9);
      --shadow-sm: 0 2px 10px rgba(0, 0, 0, 0.1);
      --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.1);
      --transition-default: all 0.3s ease;
      --border-radius-sm: 8px;
      --border-radius-md: 12px;
      --border-radius-lg: 20px;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      :root {
        --primary-gradient-start: #5a67d8;
        --primary-gradient-end: #6b46a0;
      }
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: linear-gradient(135deg, var(--primary-gradient-start) 0%, var(--primary-gradient-end) 100%);
      min-height: 100vh;
      padding: 20px;
      color: var(--text-primary);
    }

    /* Skip to content link for accessibility */
    .skip-to-content {
      position: absolute;
      top: -40px;
      left: 0;
      background: var(--text-primary);
      color: var(--primary-gradient-start);
      padding: 8px;
      text-decoration: none;
      z-index: 100;
    }
    
    .skip-to-content:focus {
      top: 0;
    }

    .docs-container {
      max-width: 1200px;
      margin: 0 auto;
      position: relative;
    }

    /* Header Styles */
    .header {
      text-align: center;
      margin-bottom: 50px;
      animation: slideDown 0.6s ease-out;
    }

    .header h1 {
      font-size: clamp(2rem, 5vw, 3.5rem);
      margin-bottom: 10px;
      text-shadow: var(--shadow-sm);
      letter-spacing: -0.02em;
    }

    .header p {
      font-size: clamp(1rem, 3vw, 1.2rem);
      opacity: 0.95;
    }

    /* Stats Grid */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      backdrop-filter: blur(10px);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--border-radius-md);
      padding: 20px;
      text-align: center;
      transition: var(--transition-default);
      animation: fadeInUp 0.6s ease-out;
    }

    .stat-card:hover {
      transform: translateY(-5px);
      background: var(--glass-hover-bg);
      border-color: var(--glass-hover-border);
    }

    .stat-number {
      font-size: clamp(1.5rem, 4vw, 2.5rem);
      font-weight: bold;
      margin-bottom: 5px;
      background: linear-gradient(135deg, #fff, rgba(255,255,255,0.8));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .stat-label {
      opacity: 0.9;
      font-size: 0.9rem;
    }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-bottom: 40px;
    }

    .glass-card {
      backdrop-filter: blur(10px);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--border-radius-lg);
      padding: 30px;
      transition: var(--transition-default);
      animation: fadeInUp 0.6s ease-out;
    }

    .glass-card:hover {
      background: var(--glass-hover-bg);
      border-color: var(--glass-hover-border);
      transform: translateY(-10px);
      box-shadow: var(--shadow-md);
    }

    .glass-card h2 {
      font-size: 1.5rem;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .glass-card p {
      opacity: 0.9;
      line-height: 1.6;
      margin-bottom: 20px;
      font-size: 0.95rem;
    }

    .glass-card code {
      background: rgba(0, 0, 0, 0.3);
      padding: 8px 12px;
      border-radius: var(--border-radius-sm);
      font-family: 'SF Mono', 'Courier New', monospace;
      font-size: 0.85rem;
      display: block;
      margin: 10px 0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Button Styles */
    .btn-group {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 15px;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: var(--border-radius-md);
      font-size: 0.95rem;
      cursor: pointer;
      transition: var(--transition-default);
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      position: relative;
      overflow: hidden;
    }

    .btn::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
      transform: translate(-50%, -50%);
      transition: width 0.6s, height 0.6s;
    }

    .btn:active::before {
      width: 300px;
      height: 300px;
    }

    .btn-primary {
      background: rgba(255, 255, 255, 0.95);
      color: var(--primary-gradient-start);
    }

    .btn-primary:hover {
      background: white;
      transform: scale(1.05);
      box-shadow: var(--shadow-sm);
    }

    .btn-secondary {
      background: var(--glass-bg);
      color: var(--text-primary);
      border: 2px solid var(--glass-border);
    }

    .btn-secondary:hover {
      background: var(--glass-hover-bg);
      border-color: var(--glass-hover-border);
      transform: scale(1.05);
    }

    /* Features Section */
    .features {
      backdrop-filter: blur(10px);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--border-radius-lg);
      padding: 40px;
      margin-bottom: 40px;
      animation: fadeInUp 0.8s ease-out;
    }

    .features h2 {
      font-size: clamp(1.5rem, 4vw, 2rem);
      margin-bottom: 30px;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }

    .feature-item {
      backdrop-filter: blur(5px);
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--border-radius-md);
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: var(--transition-default);
    }

    .feature-item:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateX(5px);
    }

    .feature-item h3 {
      margin-bottom: 10px;
      font-size: 1.1rem;
    }

    .feature-item p {
      opacity: 0.85;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    /* Quick Start List */
    .glass-card ol {
      margin-left: 20px;
      opacity: 0.95;
    }

    .glass-card li {
      margin: 10px 0;
      line-height: 1.5;
    }

    /* Footer */
    .footer {
      text-align: center;
      color: rgba(255, 255, 255, 0.8);
      padding: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      margin-top: 50px;
    }

    .footer p {
      margin: 10px 0;
    }

    .footer a {
      color: var(--text-primary);
      text-decoration: none;
      border-bottom: 1px dotted rgba(255, 255, 255, 0.5);
    }

    .footer a:hover {
      border-bottom-color: var(--text-primary);
    }

    /* Animations */
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Loading skeleton */
    .loading-skeleton {
      background: linear-gradient(90deg, var(--glass-bg) 25%, var(--glass-hover-bg) 50%, var(--glass-bg) 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      body {
        padding: 15px;
      }

      .cards-grid {
        grid-template-columns: 1fr;
        gap: 20px;
      }

      .glass-card {
        padding: 20px;
      }

      .features {
        padding: 25px;
      }

      .btn {
        padding: 10px 20px;
        font-size: 0.9rem;
      }
    }

    /* Print styles */
    @media print {
      body {
        background: white;
        color: black;
        padding: 0;
      }
      
      .glass-card, .features, .stat-card {
        background: white;
        border: 1px solid #ddd;
        color: black;
        page-break-inside: avoid;
      }
      
      .btn {
        display: none;
      }
      
      .stats, .cards-grid, .features-grid {
        break-inside: avoid;
      }
    }

    /* High contrast mode support */
    @media (prefers-contrast: high) {
      .glass-card, .features, .stat-card {
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid white;
      }
      
      .btn-primary {
        background: white;
        color: black;
        border: 2px solid black;
      }
    }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-to-content">Skip to main content</a>
  
  <div class="docs-container" id="main-content">
    <header class="header" role="banner">
      <h1>🏘️ Village API</h1>
      <p>${stats.villages} Villages at Your Fingertips</p>
    </header>

    <div class="stats" role="region" aria-label="Platform Statistics">
      <div class="stat-card">
        <div class="stat-number">${stats.villages}</div>
        <div class="stat-label">Villages Indexed</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.responseTime}</div>
        <div class="stat-label">Response Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.uptime}</div>
        <div class="stat-label">Uptime</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.tiers}</div>
        <div class="stat-label">Pricing Plans</div>
      </div>
    </div>

    <div class="cards-grid" role="region" aria-label="API Resources">
      <div class="glass-card">
        <h2>📚 Interactive API Docs</h2>
        <p>Explore all endpoints with live request/response examples. Test API calls directly from your browser.</p>
        <code>Swagger UI - Interactive Documentation</code>
        <div class="btn-group">
          <a href="/api-docs/" class="btn btn-primary" aria-label="Open Swagger UI documentation">
            🔍 Open Swagger UI
          </a>
        </div>
      </div>

      <div class="glass-card">
        <h2>📋 OpenAPI Spec</h2>
        <p>Machine-readable API specification in OpenAPI 3.0 format. Perfect for code generation and API tooling.</p>
        <code>GET ${API_BASE_URL || ''}/api-spec</code>
        <div class="btn-group">
          <a href="/api-spec" class="btn btn-primary" aria-label="Download OpenAPI specification">
            📄 Download JSON
          </a>
          <a href="https://editor.swagger.io/" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            🚀 Try in Swagger Editor
          </a>
        </div>
      </div>

      <div class="glass-card">
        <h2>🔐 Authentication</h2>
        <p>Secure access with API Keys for data endpoints & JWT for admin dashboard. Rate limits apply per plan.</p>
        <code>X-API-Key: your_api_key_here</code>
        <code>Authorization: Bearer your_jwt_token</code>
        <div class="btn-group">
          <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            📖 Authentication Guide
          </a>
        </div>
      </div>
    </div>

    <div class="features" role="region" aria-label="Core Features">
      <h2>✨ Core Features</h2>
      <div class="features-grid">
        <div class="feature-item">
          <h3>🌍 Geographic Data</h3>
          <p>Complete hierarchical data: States → Districts → Sub-districts → Villages with accurate geocoding</p>
        </div>
        <div class="feature-item">
          <h3>⚡ Lightning Fast</h3>
          <p>Cached responses under 100ms with Redis optimization and CDN edge caching</p>
        </div>
        <div class="feature-item">
          <h3>🔍 Smart Search</h3>
          <p>Full-text search and autocomplete across ${stats.villages} villages with fuzzy matching</p>
        </div>
        <div class="feature-item">
          <h3>📊 Analytics</h3>
          <p>Real-time usage tracking, advanced reporting, and detailed API metrics dashboard</p>
        </div>
        <div class="feature-item">
          <h3>🎯 Rate Limiting</h3>
          <p>Fair usage with tiered rate limits by plan (5K to 1M requests/day)</p>
        </div>
        <div class="feature-item">
          <h3>💳 Stripe Payments</h3>
          <p>Flexible billing with 4 pricing tiers, automatic invoicing, and usage-based upgrades</p>
        </div>
      </div>
    </div>

    <div class="glass-card" role="region" aria-label="Quick Start Guide">
      <h2>🚀 Quick Start Guide</h2>
      <p><strong>Get your API key in 2 minutes:</strong></p>
      <ol>
        <li>📝 Register at <code>/auth/register</code> with your business details</li>
        <li>✅ Admin approves your account (typically within 24 hours)</li>
        <li>🔑 Create API key in your dashboard</li>
        <li>🌐 Start querying villages with your API key!</li>
      </ol>
      <div class="btn-group" style="margin-top: 20px;">
        <a href="${ADMIN_DASHBOARD_URL}" class="btn btn-primary" aria-label="Go to Admin Dashboard">
          🎛️ Admin Dashboard
        </a>
        <a href="${DEMO_CLIENT_URL}" class="btn btn-secondary" aria-label="Try the demo client">
          🎮 Try Demo Client
        </a>
      </div>
    </div>

    <div class="glass-card" role="region" aria-label="API Endpoints">
      <h2>📡 Popular Endpoints</h2>
      <code>GET /v1/states - List all Indian states</code>
      <code>GET /v1/states/{id}/districts - Get districts by state</code>
      <code>GET /v1/districts/{id}/subdistricts - Get sub-districts by district</code>
      <code>GET /v1/subdistricts/{id}/villages - Get villages by sub-district</code>
      <code>GET /v1/search?q={query} - Search across all villages</code>
      <code>GET /v1/autocomplete?q={query} - Autocomplete suggestions</code>
      <div class="btn-group" style="margin-top: 20px;">
        <a href="/api-docs/" class="btn btn-secondary">
          📚 View All Endpoints
        </a>
      </div>
    </div>

    <div class="glass-card" role="region" aria-label="Pricing Plans">
      <h2>💰 Pricing Plans</h2>
      <div class="features-grid" style="margin-top: 15px;">
        <div class="feature-item">
          <h3>FREE</h3>
          <p>5,000 requests/day<br/>Basic support<br/>Community access</p>
        </div>
        <div class="feature-item">
          <h3>PREMIUM - $49/mo</h3>
          <p>50,000 requests/day<br/>Email support<br/>Analytics dashboard</p>
        </div>
        <div class="feature-item">
          <h3>PRO - $199/mo</h3>
          <p>300,000 requests/day<br/>Priority support<br/>Team access (up to 5)</p>
        </div>
        <div class="feature-item">
          <h3>UNLIMITED - $499/mo</h3>
          <p>1M+ requests/day<br/>24/7 dedicated support<br/>Custom SLA<br/>Unlimited team members</p>
        </div>
      </div>
      <div class="btn-group" style="margin-top: 20px;">
        <a href="${ADMIN_DASHBOARD_URL}/register" class="btn btn-primary">
          🚀 Start Free Trial
        </a>
      </div>
    </div>

    <footer class="footer" role="contentinfo">
      <p>🌟 Built with Node.js, Express, PostgreSQL, and Redis</p>
      <p>📧 Need help? Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
      <p>⭐ Star us on <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      <p style="margin-top: 10px; font-size: 0.85rem;">© 2024 Village API. All villages indexed. | 
        <a href="/privacy" style="color: white;">Privacy Policy</a> | 
        <a href="/terms" style="color: white;">Terms of Service</a>
      </p>
    </footer>
  </div>

  <!-- Optional: Add analytics tracking (only in production) -->
  ${process.env.NODE_ENV === 'production' && process.env.GA_TRACKING_ID ? `
  <script async src="https://www.googletagmanager.com/gtag/js?id=${process.env.GA_TRACKING_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${process.env.GA_TRACKING_ID}');
  </script>
  ` : ''}
  
  <!-- Performance monitoring script -->
  <script>
    // Report performance metrics
    if ('performance' in window && 'getEntriesByType' in performance) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            console.log('LCP:', entry.renderTime || entry.loadTime);
          }
        }
      });
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    }
    
    // Add loading class removal
    window.addEventListener('load', () => {
      document.body.classList.add('loaded');
    });
  </script>
</body>
</html>`;
}

// Export helper function to update stats dynamically
export async function getDynamicDocsPage(statsData) {
  const basePage = getDocsPage();

  // If statsData provided, inject dynamic values
  if (statsData) {
    return basePage
      .replace(/>619K\+</, `>${statsData.villages || '619K+'}<`)
      .replace(/>&lt;100ms</, `>${statsData.responseTime || '<100ms'}<`)
      .replace(/>99.9%</, `>${statsData.uptime || '99.9%'}<`)
      .replace(/>4 Tiers</, `>${statsData.tiers || '4 Tiers'}<`);
  }

  return basePage;
}

// Export metadata for SEO
export const docsMetadata = {
  title: 'Village API Documentation',
  description: 'Access 619,000+ Indian villages data with high-performance REST API',
  keywords: ['API', 'Villages', 'India', 'Geographic Data', 'REST API', 'Developer Tools'],
  author: 'Village API Team',
  robots: 'index, follow',
  sitemap: '/sitemap.xml',
};
