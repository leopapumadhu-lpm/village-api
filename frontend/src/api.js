// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY;

// Validate configuration on module load
const isProduction = import.meta.env.PROD;
let configValidated = false;

function validateConfig() {
  if (configValidated) return;
  
  console.log('🔧 API Config:', { 
    API_URL, 
    API_KEY: API_KEY ? '✓ Set' : '✗ Missing',
    environment: import.meta.env.MODE
  });

  if (!API_KEY) {
    const errorMsg = '❌ VITE_API_KEY not configured. Please check your .env.local file';
    console.error(errorMsg);
    if (isProduction) {
      // In production, don't throw immediately but log critically
      console.warn('API will not function without an API key');
    }
  }
  
  configValidated = true;
}

// Request timeout helper
const fetchWithTimeout = async (url, options, timeout = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
};

// Retry logic for failed requests
const fetchWithRetry = async (url, options, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error;
      console.warn(`Retry ${i + 1}/${maxRetries} for ${url}:`, error.message);
      
      if (i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
};

// Cache management
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`🔄 Cache hit: ${key}`);
    return cached.data;
  }
  return null;
}

function setCached(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
  
  // Clean up old cache entries periodically
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        cache.delete(k);
      }
    }
  }
}

function getCacheKey(endpoint, params = {}) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

// Rate limiting helper
let requestCount = 0;
let rateLimitReset = Date.now();
const RATE_LIMIT = 100; // Max requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit() {
  const now = Date.now();
  if (now > rateLimitReset) {
    requestCount = 0;
    rateLimitReset = now + RATE_WINDOW;
  }
  
  if (requestCount >= RATE_LIMIT) {
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil((rateLimitReset - now) / 1000)} seconds.`);
  }
  
  requestCount++;
}

// Core API call function
export async function apiCall(endpoint, options = {}) {
  validateConfig();
  
  if (!API_KEY && !options.skipAuth) {
    console.warn('⚠️ API key not configured. Requests may fail.');
  }
  
  // Normalize endpoint - ensure it starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_URL}/v1${normalizedEndpoint}`;
  
  // Check rate limit
  try {
    checkRateLimit();
  } catch (error) {
    console.error('Rate limit error:', error.message);
    throw error;
  }
  
  // Check cache for GET requests
  const cacheKey = getCacheKey(normalizedEndpoint, options.params);
  const useCache = options.useCache !== false && (!options.method || options.method === 'GET');
  
  if (useCache) {
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return cachedData;
    }
  }
  
  // Build query string if params provided
  let requestUrl = url;
  if (options.params) {
    const params = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    const queryString = params.toString();
    if (queryString) {
      requestUrl += `?${queryString}`;
    }
  }
  
  console.log(`📡 API Call: ${options.method || 'GET'} ${requestUrl}`);
  
  const requestOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY }),
      ...options.headers,
    },
    ...(options.body && { body: JSON.stringify(options.body) }),
  };
  
  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete requestOptions.headers['Content-Type'];
  }
  
  try {
    const response = await fetchWithRetry(requestUrl, requestOptions, options.retries || 3);
    
    // Handle different response statuses
    if (response.status === 401) {
      throw new Error('Invalid or missing API key. Please check your configuration.');
    }
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limit exceeded. ${retryAfter ? `Try again in ${retryAfter} seconds.` : 'Please try again later.'}`);
    }
    
    if (!response.ok) {
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    // Extract the actual data from the response structure
    const result = data.data || data;
    
    console.log(`✅ API Success: ${normalizedEndpoint}`, {
      success: data.success,
      count: data.count,
      dataLength: Array.isArray(result) ? result.length : 1
    });
    
    // Cache successful GET requests
    if (useCache && data.success) {
      setCached(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ API Error on ${normalizedEndpoint}:`, {
      message: error.message,
      stack: import.meta.env.DEV ? error.stack : undefined
    });
    
    // Enhance error with additional context
    error.endpoint = normalizedEndpoint;
    error.status = error.status || 500;
    
    throw error;
  }
}

// Geographic endpoints with caching
export async function getStates(options = {}) {
  return apiCall('/states', { 
    ...options, 
    useCache: options.useCache !== false,
    cache: true 
  });
}

export async function getDistricts(stateId, options = {}) {
  if (!stateId) {
    throw new Error('State ID is required');
  }
  return apiCall(`/states/${stateId}/districts`, { 
    ...options,
    params: options.params,
    useCache: options.useCache !== false
  });
}

export async function getSubDistricts(districtId, options = {}) {
  if (!districtId) {
    throw new Error('District ID is required');
  }
  return apiCall(`/districts/${districtId}/subdistricts`, { 
    ...options,
    useCache: options.useCache !== false
  });
}

export async function getVillages(subDistrictId, page = 1, limit = 100, options = {}) {
  if (!subDistrictId) {
    throw new Error('Sub-district ID is required');
  }
  
  const validPage = Math.max(1, Math.min(100, page));
  const validLimit = Math.max(1, Math.min(500, limit));
  
  return apiCall(`/subdistricts/${subDistrictId}/villages`, {
    ...options,
    params: { page: validPage, limit: validLimit },
    useCache: options.useCache !== false
  });
}

// Search endpoints
export async function searchVillages(query, limit = 25, options = {}) {
  if (!query || query.trim().length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }
  
  const validLimit = Math.max(1, Math.min(100, limit));
  const encodedQuery = encodeURIComponent(query.trim());
  
  return apiCall(`/search?q=${encodedQuery}&limit=${validLimit}`, {
    ...options,
    useCache: false // Don't cache search results as they're dynamic
  });
}

export async function autocompleteVillages(query, options = {}) {
  if (!query || query.trim().length < 2) {
    return []; // Return empty array for short queries
  }
  
  const encodedQuery = encodeURIComponent(query.trim());
  
  return apiCall(`/autocomplete?q=${encodedQuery}`, {
    ...options,
    useCache: options.useCache !== false,
    cacheTTL: 60 * 1000 // 1 minute cache for autocomplete
  });
}

// Batch operations
export async function batchGetVillages(subDistrictIds, options = {}) {
  if (!Array.isArray(subDistrictIds) || subDistrictIds.length === 0) {
    throw new Error('At least one sub-district ID is required');
  }
  
  if (subDistrictIds.length > 10) {
    throw new Error('Maximum 10 sub-districts per batch request');
  }
  
  const promises = subDistrictIds.map(id => getVillages(id, 1, 100, options));
  const results = await Promise.allSettled(promises);
  
  return results.map((result, index) => ({
    subDistrictId: subDistrictIds[index],
    success: result.status === 'fulfilled',
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason.message : null
  }));
}

// Helper function to clear cache
export function clearCache(endpoint = null) {
  if (endpoint) {
    // Clear specific endpoint from cache
    for (const [key] of cache.entries()) {
      if (key.startsWith(endpoint)) {
        cache.delete(key);
        console.log(`🗑️ Cleared cache for: ${key}`);
      }
    }
  } else {
    // Clear all cache
    cache.clear();
    console.log('🗑️ Cleared all API cache');
  }
}

// Get cache statistics
export function getCacheStats() {
  const stats = {
    size: cache.size,
    entries: [],
    oldestEntry: null,
    newestEntry: null
  };
  
  let oldestTime = Date.now();
  let newestTime = 0;
  
  for (const [key, value] of cache.entries()) {
    stats.entries.push({
      key,
      age: Date.now() - value.timestamp,
      ageSeconds: ((Date.now() - value.timestamp) / 1000).toFixed(1)
    });
    
    if (value.timestamp < oldestTime) {
      oldestTime = value.timestamp;
      stats.oldestEntry = key;
    }
    if (value.timestamp > newestTime) {
      newestTime = value.timestamp;
      stats.newestEntry = key;
    }
  }
  
  return stats;
}

// Request interceptor for adding custom headers
let requestInterceptors = [];
let responseInterceptors = [];

export function addRequestInterceptor(interceptor) {
  requestInterceptors.push(interceptor);
}

export function addResponseInterceptor(interceptor) {
  responseInterceptors.push(interceptor);
}

// Enhanced API call with interceptors
export async function apiCallWithInterceptors(endpoint, options = {}) {
  // Apply request interceptors
  let modifiedOptions = { ...options };
  for (const interceptor of requestInterceptors) {
    modifiedOptions = await interceptor(endpoint, modifiedOptions);
  }

  const result = await apiCall(endpoint, modifiedOptions);

  // Apply response interceptors
  let modifiedResult = result;
  for (const interceptor of responseInterceptors) {
    modifiedResult = await interceptor(endpoint, modifiedResult);
  }

  return modifiedResult;
}

// Health check endpoint
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      return { status: 'healthy', ...data };
    }
    return { status: 'unhealthy', error: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

// Export configuration for debugging
export function getApiConfig() {
  return {
    apiUrl: API_URL,
    hasApiKey: !!API_KEY,
    environment: import.meta.env.MODE,
    isProduction: import.meta.env.PROD,
    cacheSize: cache.size,
    rateLimit: {
      requests: requestCount,
      remaining: Math.max(0, RATE_LIMIT - requestCount),
      resetIn: Math.max(0, rateLimitReset - Date.now())
    }
  };
}

// Auto-cleanup cache on interval (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleaned} expired entries`);
    }
  }, CACHE_TTL);
}

// Error boundary helper for React components
export function withApiErrorHandling(componentName) {
  return {
    handleError: (error, context = {}) => {
      console.error(`API Error in ${componentName}:`, {
        message: error.message,
        endpoint: error.endpoint,
        context,
        timestamp: new Date().toISOString()
      });
      
      // Categorize error types
      if (error.message.includes('API key')) {
        return { type: 'AUTH_ERROR', message: 'Invalid API key. Please check your configuration.' };
      }
      if (error.message.includes('Rate limit')) {
        return { type: 'RATE_LIMIT', message: error.message };
      }
      if (error.message.includes('timeout')) {
        return { type: 'TIMEOUT', message: 'Request timed out. Please try again.' };
      }
      if (error.message.includes('Network')) {
        return { type: 'NETWORK', message: 'Network error. Please check your connection.' };
      }
      
      return { type: 'UNKNOWN', message: error.message };
    }
  };
}

// Default export for convenient importing
export default {
  apiCall,
  getStates,
  getDistricts,
  getSubDistricts,
  getVillages,
  searchVillages,
  autocompleteVillages,
  batchGetVillages,
  clearCache,
  getCacheStats,
  checkApiHealth,
  getApiConfig,
  addRequestInterceptor,
  addResponseInterceptor,
  withApiErrorHandling
};
