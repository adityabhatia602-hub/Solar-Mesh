import apiClient from './client';

export const telemetryApi = {
  ingestTelemetry: async ({ device_id, production_kwh = 0, consumption_kwh = 0, battery_kwh = 0 }) => {
    const response = await apiClient.post('/api/telemetry', {
      device_id,
      production_kwh: Number(production_kwh),
      consumption_kwh: Number(consumption_kwh),
      battery_kwh: Number(battery_kwh),
    });
    return response.data; // TelemetryOut
  },

  getDeviceHistory: async (deviceId, limit = 100) => {
    const response = await apiClient.get(`/api/telemetry/device/${deviceId}`, {
      params: { limit },
    });
    return response.data; // list of TelemetryOut
  },
};
