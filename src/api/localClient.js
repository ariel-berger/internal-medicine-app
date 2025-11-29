// Local API client to replace Base44 SDK
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'; // Python Flask backend URL

class LocalAPIClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Generic CRUD operations
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Auth methods
  async login(email, password) {
    const response = await this.post('/auth/login', { email, password });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async logout() {
    try {
      await this.post('/auth/logout');
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      this.setToken(null);
    }
  }

  async register(email, password, fullName) {
    const response = await this.post('/auth/register', { email, password, fullName });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async googleLogin(idToken) {
    const response = await this.post('/auth/google', { idToken });
    if (response.token) {
      this.setToken(response.token);
    }
    return response;
  }

  async me() {
    return this.get('/auth/me');
  }

  // Medical Articles methods
  async getRelevantArticles(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    if (params.sort) queryParams.append('sort', params.sort);
    if (params.excludeHidden !== undefined) queryParams.append('exclude_hidden', params.excludeHidden ? 'true' : 'false');
    
    const endpoint = `/medical-articles/relevant${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return this.get(endpoint);
  }

  async getRelevantArticlesStats() {
    return this.get('/medical-articles/relevant/stats');
  }

  async getMedicalArticle(articleId) {
    return this.get(`/medical-articles/${articleId}`);
  }

  async searchMedicalArticles(query, params = {}) {
    const queryParams = new URLSearchParams();
    queryParams.append('q', query);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    
    return this.get(`/medical-articles/search?${queryParams.toString()}`);
  }

  async setMedicalArticleKey(articleId, isKey) {
    return this.put(`/medical-articles/${articleId}/key`, { is_key_study: !!isKey });
  }

  async setMedicalArticleHiddenFromDashboard(articleId, isHidden) {
    return this.put(`/medical-articles/${articleId}/hide-dashboard`, { hidden_from_dashboard: !!isHidden });
  }

  // Admin methods
  async fetchArticlesByDate(startDate, endDate, options = {}) {
    return this.post('/admin/articles/fetch-by-date', {
      start_date: startDate,
      end_date: endDate,
      email: options.email,
      model: options.model || 'claude'
    });
  }

  async addSingleArticle(url) {
    return this.post('/admin/articles/add-single', { url });
  }
}

// Create singleton instance
export const localClient = new LocalAPIClient();