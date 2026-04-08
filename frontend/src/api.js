const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  VITE_API_KEY not configured in .env.local');
}

export async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_URL}/v1${endpoint}`, {
      ...options,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

export async function getStates() {
  return apiCall('/states');
}

export async function getDistricts(stateId) {
  return apiCall(`/states/${stateId}/districts`);
}

export async function getSubDistricts(districtId) {
  return apiCall(`/districts/${districtId}/subdistricts`);
}

export async function getVillages(subDistrictId, page = 1, limit = 100) {
  return apiCall(`/subdistricts/${subDistrictId}/villages?page=${page}&limit=${limit}`);
}

export async function searchVillages(query, limit = 25) {
  return apiCall(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export async function autocompleteVillages(query) {
  return apiCall(`/autocomplete?q=${encodeURIComponent(query)}`);
}
