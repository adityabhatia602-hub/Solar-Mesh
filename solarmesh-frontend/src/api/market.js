import apiClient from './client';

export const marketApi = {
  placeOrder: async ({ side, price_per_kwh, quantity_kwh, node_id, expires_in_hours = 48 }) => {
    const response = await apiClient.post('/api/market/orders', {
      side,
      price_per_kwh: Number(price_per_kwh),
      quantity_kwh: Number(quantity_kwh),
      node_id,
      expires_in_hours: Number(expires_in_hours),
    });
    return response.data; // OrderOut
  },

  getMyOrders: async (statusFilter = null) => {
    const response = await apiClient.get('/api/market/orders', {
      params: statusFilter ? { status: statusFilter } : {},
    });
    return response.data; // list of OrderOut
  },

  getOpenOrders: async ({ side = null, nodeId = null, limit = 100 } = {}) => {
    const response = await apiClient.get('/api/market/orders/open', {
      params: {
        ...(side ? { side } : {}),
        ...(nodeId ? { node_id: nodeId } : {}),
        limit,
      },
    });
    return response.data; // list of OrderOut (all users, open only)
  },

  getOrderBook: async (nodeId = null) => {
    const response = await apiClient.get('/api/market/orderbook', {
      params: nodeId ? { node_id: nodeId } : {},
    });
    return response.data; // OrderBookOut: { bids: [], offers: [], spread: number, midpoint: number }
  },

  cancelOrder: async (orderId) => {
    const response = await apiClient.delete(`/api/market/orders/${orderId}`);
    return response.data;
  },

  getMyTrades: async (limit = 50) => {
    const response = await apiClient.get('/api/market/trades', {
      params: { limit },
    });
    return response.data; // list of TradeOut
  },

  getTrade: async (tradeId) => {
    const response = await apiClient.get(`/api/trades/${tradeId}`);
    return response.data; // TradeOut with explanation
  },

  triggerMatching: async () => {
    const response = await apiClient.post('/api/market/match');
    return response.data; // MatchResult: { matched_trades, total_volume_kwh, total_value, trades }
  },
};
