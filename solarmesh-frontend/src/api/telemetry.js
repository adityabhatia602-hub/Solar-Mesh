import apiClient from './client';

export const telemetryApi = {
  ingestTelemetry: async ({
    device_id,
    production_kw = 0,
    consumption_kw = 0,
    battery_soc = 50,
    battery_kw = 0,
    voltage = 230.0,
    current = 0.0,
    power_kw = 0.0,
  }) => {
    const response = await apiClient.post('/api/telemetry', {
      device_id,
      production_kw: Number(production_kw),
      consumption_kw: Number(consumption_kw),
      battery_soc: Number(battery_soc),
      battery_kw: Number(battery_kw),
      voltage: Number(voltage),
      current: Number(current),
      power_kw: Number(power_kw),
    });
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
