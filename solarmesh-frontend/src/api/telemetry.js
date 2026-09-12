import apiClient from './client';

export const telemetryApi = {
  ingestTelemetry: async (payload) => {
    const response = await apiClient.post('/api/telemetry', payload);
    return response.data; // TelemetryOut
  },

  getLatest: async (deviceId = null, limit = 50) => {
    const response = await apiClient.get('/api/telemetry/latest', {
      params: deviceId ? { device_id: deviceId, limit } : { limit },
    });
    return response.data; // list of TelemetryOut (latest per device)
  },

  getDeviceHistory: async (deviceId, limit = 100) => {
    const response = await apiClient.get(`/api/telemetry/device/${deviceId}`, {
      params: { limit },
    });
    return response.data; // list of TelemetryOut
  },
};

// Backwards-compatible alias for older components.
export const postTelemetry = telemetryApi.ingestTelemetry;
