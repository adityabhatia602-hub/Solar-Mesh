import apiClient from './client';

export const gridApi = {
  getNodes: async (region = null) => {
    const response = await apiClient.get('/api/grid/nodes', {
      params: region ? { region } : {},
    });
    return response.data; // array of GridNodeOut: { id, code, name, node_type, region, congestion_level }
  },

  getNode: async (nodeId) => {
    const response = await apiClient.get(`/api/grid/nodes/${nodeId}`);
    return response.data;
  },

  getEdges: async () => {
    const response = await apiClient.get('/api/grid/edges');
    return response.data; // array of GridEdgeOut: { id, from_node_id, to_node_id, capacity_kw, load_kw, loss_factor, utilization, is_active }
  },

  quoteRoute: async (fromNodeId, toNodeId) => {
    const response = await apiClient.get('/api/grid/route', {
      params: {
        from_node: fromNodeId,
        to_node: toNodeId,
      },
    });
    return response.data; // RouteQuote: { from_node_id, to_node_id, feasible, path_node_ids, path_loss, congestion_penalty, total_network_cost_per_kwh }
  },

  getMyDevices: async () => {
    const response = await apiClient.get('/api/grid/devices');
    return response.data; // array of DeviceOut
  },

  registerDevice: async ({ name, node_id, device_type = 'solar_panel', capacity_kwh = 10.0 }) => {
    const response = await apiClient.post('/api/grid/devices', {
      name,
      node_id,
      device_type,
      capacity_kwh: Number(capacity_kwh),
    });
    return response.data;
  },
};
