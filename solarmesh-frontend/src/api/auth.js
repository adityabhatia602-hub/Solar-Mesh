import apiClient from './client';

export const authApi = {
  login: async (email, password) => {
    // Backend supports both OAuth2 form data and JSON /login-json
    const response = await apiClient.post('/api/auth/login-json', {
      email,
      password,
    });
    return response.data; // { access_token, refresh_token, token_type }
  },

  register: async ({ email, password, full_name, role }) => {
    const response = await apiClient.post('/api/auth/register', {
      email,
      password,
      full_name,
      role: role || 'prosumer',
    });
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get('/api/auth/me');
    return response.data; // { id, email, full_name, role, is_active }
  },

  refresh: async (refreshToken) => {
    const response = await apiClient.post('/api/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },
};
