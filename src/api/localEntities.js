import { localClient } from './localClient';

// Study entity
export const Study = {
  async list(sortBy = '-publication_date', limit = null) {
    const params = new URLSearchParams();
    if (sortBy) params.append('sort', sortBy);
    if (limit) params.append('limit', limit);
    
    const queryString = params.toString();
    return localClient.get(`/studies${queryString ? `?${queryString}` : ''}`);
  },

  async get(id) {
    return localClient.get(`/studies/${id}`);
  },

  async create(data) {
    return localClient.post('/studies', data);
  },

  async update(id, data) {
    return localClient.put(`/studies/${id}`, data);
  },

  async delete(id) {
    return localClient.delete(`/studies/${id}`);
  },

  async filter(filters, sortBy = null) {
    const params = new URLSearchParams();
    
    // Add filter parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else {
          params.append(key, value);
        }
      }
    });
    
    if (sortBy) params.append('sort', sortBy);
    
    const queryString = params.toString();
    return localClient.get(`/studies/filter${queryString ? `?${queryString}` : ''}`);
  },

  async bulkCreate(studies) {
    return localClient.post('/studies/bulk', { studies });
  }
};

// Comment entity
export const Comment = {
  async list(sortBy = '-created_date') {
    const params = new URLSearchParams();
    if (sortBy) params.append('sort', sortBy);
    
    const queryString = params.toString();
    return localClient.get(`/comments${queryString ? `?${queryString}` : ''}`);
  },

  async get(id) {
    return localClient.get(`/comments/${id}`);
  },

  async create(data) {
    return localClient.post('/comments', data);
  },

  async update(id, data) {
    return localClient.put(`/comments/${id}`, data);
  },

  async delete(id) {
    return localClient.delete(`/comments/${id}`);
  },

  async filter(filters, sortBy = null) {
    const params = new URLSearchParams();
    
    // Add filter parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else {
          params.append(key, value);
        }
      }
    });
    
    if (sortBy) params.append('sort', sortBy);
    
    const queryString = params.toString();
    return localClient.get(`/comments${queryString ? `?${queryString}` : ''}`);
  }
};

// UserStudyStatus entity
export const UserStudyStatus = {
  async list(sortBy = '-created_date') {
    const params = new URLSearchParams();
    if (sortBy) params.append('sort', sortBy);
    
    const queryString = params.toString();
    return localClient.get(`/user-study-status${queryString ? `?${queryString}` : ''}`);
  },

  async get(id) {
    return localClient.get(`/user-study-status/${id}`);
  },

  async create(data) {
    return localClient.post('/user-study-status', data);
  },

  async update(id, data) {
    return localClient.put(`/user-study-status/${id}`, data);
  },

  async delete(id) {
    return localClient.delete(`/user-study-status/${id}`);
  },

  async filter(filters, sortBy = null) {
    const params = new URLSearchParams();
    
    // Add filter parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else {
          params.append(key, value);
        }
      }
    });
    
    if (sortBy) params.append('sort', sortBy);
    
    const queryString = params.toString();
    return localClient.get(`/user-study-status${queryString ? `?${queryString}` : ''}`);
  }
};

// User entity (auth)
export const User = {
  async me() {
    return localClient.me();
  },

  async list() {
    return localClient.get('/users');
  },

  async get(id) {
    return localClient.get(`/users/${id}`);
  },

  async create(data) {
    return localClient.post('/users', data);
  },

  async update(id, data) {
    return localClient.put(`/users/${id}`, data);
  },

  async delete(id) {
    return localClient.delete(`/users/${id}`);
  },

  async login(email, password) {
    return localClient.login(email, password);
  },

  async logout() {
    return localClient.logout();
  },

  async register(email, password, fullName) {
    return localClient.register(email, password, fullName);
  }
};