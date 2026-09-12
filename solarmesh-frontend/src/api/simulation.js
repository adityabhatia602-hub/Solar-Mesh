import apiClient from './client';

export const simulationApi = {
  getStatus: async () => {
    const response = await apiClient.get('/api/simulation/status');
    return response.data; // { is_running, interval_seconds, tick_count, last_tick_at, started_at, loop_alive }
  },

  start: async () => {
    const response = await apiClient.post('/api/simulation/start');
    return response.data;
  },

  stop: async () => {
    const response = await apiClient.post('/api/simulation/stop');
    return response.data;
  },

  tick: async (ticks = 1) => {
    const response = await apiClient.post('/api/simulation/tick', { ticks });
    return response.data; // { ticks_run, total_trades, total_volume_kwh, last }
  },
};

export const analyticsApi = {
  getDashboard: async (hours = 24) => {
    const response = await apiClient.get('/api/analytics/dashboard', { params: { hours } });
    return response.data;
  },

  getGrid: async () => {
    const response = await apiClient.get('/api/analytics/grid');
    return response.data;
  },

  getMarket: async () => {
    const response = await apiClient.get('/api/analytics/market');
    return response.data;
  },
};
